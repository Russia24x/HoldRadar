import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createSession, serializeSession, sessionCookieOptions } from "@/lib/session";
import { isTreasuryAddress, recoverEvmSigner, verifySolanaSigner } from "@/lib/verify/owner";

export const dynamic = "force-dynamic";

/**
 * Owner signature verification (blueprint §7):
 * the server recovers the signer from the signature and ONLY issues a free
 * session when the recovered address equals one of the two treasury addresses.
 * Client-side claims are never trusted.
 */

const BodySchema = z.object({
  address: z.string().min(20).max(100),
  chain: z.enum(["abstract", "solana"]),
  signature: z.string().min(40).max(300),
  nonce: z.string().min(10).max(100),
});

export async function POST(req: Request) {
  const rl = rateLimit(`owner-verify:${clientIp(req)}`, 15, 10 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "تعداد تلاش‌ها زیاد است." }, { status: 429 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const { address, chain, signature, nonce } = body;

  const challenge = await db.ownerChallenge.findUnique({ where: { nonce } });
  if (!challenge) {
    return NextResponse.json({ error: "چالش یافت نشد؛ دوباره درخواست دهید." }, { status: 400 });
  }
  if (challenge.used) {
    return NextResponse.json({ error: "این چالش قبلاً استفاده شده است." }, { status: 400 });
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "چالش منقضی شده است؛ دوباره درخواست دهید." }, { status: 400 });
  }
  if (challenge.address !== address || challenge.chain !== chain) {
    return NextResponse.json({ error: "چالش با این آدرس/زنجیره مطابقت ندارد." }, { status: 400 });
  }

  let recovered: string | null = null;
  if (chain === "abstract") {
    recovered = recoverEvmSigner(challenge.message, signature);
    if (!recovered) {
      return NextResponse.json({ error: "امضای اتریومی نامعتبر است." }, { status: 401 });
    }
  } else {
    const ok = verifySolanaSigner(challenge.message, signature, address);
    if (!ok) {
      return NextResponse.json({ error: "امضای سولانا نامعتبر است." }, { status: 401 });
    }
    recovered = address;
  }

  if (!isTreasuryAddress(chain, recovered)) {
    await db.ownerChallenge.update({ where: { nonce }, data: { used: true } });
    return NextResponse.json(
      { error: "این آدرس، آدرس خزانهٔ مجاز نیست؛ دسترسی رایگان صادر نشد." },
      { status: 403 }
    );
  }

  await db.ownerChallenge.update({ where: { nonce }, data: { used: true } });

  const payload = createSession({
    scope: "read:rankings",
    source: "owner",
    chain,
    payer: recovered,
  });
  await db.sessionRecord.create({
    data: {
      id: payload.id,
      source: "owner",
      chain,
      payer: recovered,
      expiresAt: new Date(payload.expMs),
    },
  });

  const res = NextResponse.json({ ok: true, source: "owner", expiresAt: payload.expMs });
  const c = sessionCookieOptions();
  res.cookies.set({ ...c, value: serializeSession(payload) });
  return res;
}
