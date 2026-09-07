import { NextResponse } from "next/server";
import { getLatestSnapshot, refreshIfStale } from "@/lib/pipeline";
import { readSessionCookie } from "@/lib/session";
import { db } from "@/lib/db";
import { SITE } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Rankings delivery — strictly session-gated (blueprint §8):
 * no ranking row ever exists in the JS bundle or static HTML.
 */
export async function GET() {
  const session = await readSessionCookie();
  if (!session || session.scope !== "read:rankings") {
    return NextResponse.json({ error: "نشست معتبر نیست. برای مشاهده، پرداخت لازم است." }, { status: 401 });
  }

  // server-side session revocation/expiry from the audit record
  const rec = await db.sessionRecord.findUnique({ where: { id: session.id } });
  if (!rec || rec.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "نشست منقضی شده است؛ دوباره پرداخت کنید." }, { status: 401 });
  }

  void refreshIfStale();
  const snap = await getLatestSnapshot();
  if (!snap) {
    return NextResponse.json(
      { error: "اسنپ‌شات رتبه‌بندی هنوز آماده نیست؛ چند دقیقه بعد تلاش کنید." },
      { status: 503, headers: { "retry-after": "300" } }
    );
  }

  return NextResponse.json(
    {
      ...snap,
      rows: snap.rows.slice(0, SITE.topN),
      sessionExpiresAt: session.expMs,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
