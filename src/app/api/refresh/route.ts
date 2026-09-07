import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import { readSessionCookie } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Manual pipeline trigger (equivalent of the Worker's scheduled() run):
 * authorized via the QA/operator key or an owner session only.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`refresh:${clientIp(req)}`, 6, 10 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است." }, { status: 429 });
  }

  const qa = process.env.QA_UNLOCK_TOKEN;
  const key = req.headers.get("x-qa-key");
  let authorized = Boolean(qa && key && key === qa);

  if (!authorized) {
    const session = await readSessionCookie();
    const rec = session
      ? await (await import("@/lib/db")).db.sessionRecord.findUnique({ where: { id: session.id } })
      : null;
    authorized = Boolean(rec && rec.source === "owner");
  }

  if (!authorized) {
    return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 403 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const result = await runPipeline("manual", force);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
