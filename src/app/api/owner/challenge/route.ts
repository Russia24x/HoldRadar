import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { bs58Decode } from "@/lib/verify/owner";

export const dynamic = "force-dynamic";

/**
 * One-time challenge for treasury-owner login (blueprint §7).
 * A fresh nonce is minted per request; the message binds address+chain+time.
 * The nonce is single-use and expires in 10 minutes.
 */

const BodySchema = z.object({
  address: z.string().min(20).max(100),
  chain: z.enum(["abstract", "solana"]),
});

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function POST(req: Request) {
  const rl = rateLimit(`owner-chal:${clientIp(req)}`, 15, 10 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است." }, { status: 429 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const { address, chain } = body;

  // format validation (does not reveal treasury membership)
  if (chain === "abstract" && !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "آدرس اتریومی نامعتبر است." }, { status: 400 });
  }
  if (chain === "solana") {
    try {
      if (bs58Decode(address).length !== 32) throw new Error("bad");
    } catch {
      return NextResponse.json({ error: "آدرس سولانا نامعتبر است." }, { status: 400 });
    }
  }

  const nonce = "0x" + randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const message = [
    "HoldRadar — Owner Access",
    `Chain: ${chain}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Valid until: ${expiresAt.toISOString()}`,
    "",
    "با امضای این پیام، مالکیت آدرس خزانه را اثبات می‌کنید.",
  ].join("\n");

  await db.ownerChallenge.create({
    data: { nonce, chain, address, message, expiresAt },
  });

  // housekeeping: drop expired challenges
  void db.ownerChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

  return NextResponse.json({ message, nonce, expiresAt: expiresAt.toISOString() });
}
