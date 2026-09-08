import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { CHAINS, type AssetSpec, paymentRequirements, SITE } from "@/lib/config";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { sessionCookieOptions, createSession, serializeSession } from "@/lib/session";
import { verifySolanaPayment } from "@/lib/verify/solana";
import { verifyAbstractPayment } from "@/lib/verify/evm";

export const dynamic = "force-dynamic";

/**
 * x402-style payment gate (blueprint §6):
 *  - POST without txHash → HTTP 402 + payment requirements (accepts list)
 *  - POST with txHash → on-chain settlement verification (server-side),
 *    dedup via UsedPayment (kv:used-payments equivalent), then a signed,
 *    HttpOnly session cookie is issued (kv:rankings read access).
 */

const BodySchema = z.object({
  chain: z.enum(["abstract", "solana"]),
  asset: z.string().min(1),
  txHash: z.string().min(8).max(120).optional(),
  qaToken: z.string().min(8).max(120).optional(),
});

function assetOf(chain: "abstract" | "solana", asset: string): AssetSpec | null {
  return CHAINS[chain].assets.find((a) => a.symbol.toLowerCase() === asset.toLowerCase()) ?? null;
}

async function issueSession(opts: {
  source: string;
  chain?: string;
  payer?: string;
  txHash?: string;
}) {
  const payload = createSession({ scope: "read:rankings", source: opts.source, ...opts });
  await db.sessionRecord.create({
    data: {
      id: payload.id,
      source: opts.source,
      chain: opts.chain ?? null,
      payer: opts.payer ?? null,
      txHash: opts.txHash ?? null,
      expiresAt: new Date(payload.expMs),
    },
  });
  return payload;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`unlock:${ip}`, 20, 10 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  /* QA path — only when the operator sets QA_UNLOCK_TOKEN (dev/QA). In
     production it stays unset, so this branch can never authenticate. */
  const qa = process.env.QA_UNLOCK_TOKEN;
  if (body.qaToken && qa && body.qaToken === qa) {
    const payload = await issueSession({ source: "qa", chain: body.chain });
    const res = NextResponse.json({ ok: true, source: "qa", expiresAt: payload.expMs });
    const c = sessionCookieOptions();
    res.cookies.set({ ...c, value: serializeSession(payload) });
    return res;
  }

  const asset = assetOf(body.chain, body.asset);
  if (!asset) {
    return NextResponse.json(
      { error: "دارایی پذیرفته‌شده نیست.", requirements: paymentRequirements() },
      { status: 402, headers: { "x-pay": "x402", "x-pay-schemes": "exact" } }
    );
  }

  if (!body.txHash) {
    // x402 handshake: tell the client exactly what we accept
    return NextResponse.json(
      {
        error: "پرداخت لازم است (HTTP 402).",
        requirements: paymentRequirements(),
      },
      { status: 402, headers: { "x-pay": "x402", "x-pay-schemes": "exact" } }
    );
  }

  const txHash = body.txHash.trim();
  const dedupId = `${body.chain}:${txHash}`;

  // replay protection — a settled payment can only mint ONE session
  const existing = await db.usedPayment.findUnique({ where: { id: dedupId } });
  if (existing) {
    return NextResponse.json(
      { error: "این تراکنش قبلاً برای ساخت نشست استفاده شده است." },
      { status: 409 }
    );
  }

  const result =
    body.chain === "solana"
      ? await verifySolanaPayment(txHash, asset)
      : await verifyAbstractPayment(txHash, asset);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.message ?? "راستی‌آزمایی پرداخت ناموفق بود.",
        code: result.code,
        requirements: paymentRequirements(),
      },
      { status: 402 }
    );
  }

  // persist used payment + session atomically-ish (dedup key prevents double mint)
  await db.usedPayment.create({
    data: {
      id: dedupId,
      chain: body.chain,
      asset: asset.symbol,
      txHash,
      amountRaw: result.amountRaw ?? null,
      amountUsd: result.amountUsd ?? null,
      payer: result.payer ?? null,
    },
  });

  const payload = await issueSession({
    source: "payment",
    chain: body.chain,
    payer: result.payer,
    txHash,
  });
  await db.usedPayment.update({
    where: { id: dedupId },
    data: { sessionId: payload.id },
  });

  const res = NextResponse.json({
    ok: true,
    source: "payment",
    chain: body.chain,
    asset: asset.symbol,
    amountUsd: result.amountUsd,
    expiresAt: payload.expMs,
    sessionHours: SITE.sessionHours,
  });
  const c = sessionCookieOptions();
  res.cookies.set({ ...c, value: serializeSession(payload) });
  return res;
}
