import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSessionCookie } from "@/lib/session";
import { SITE } from "@/lib/config";
import type { ScoredRow } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const MAX_DAYS = 14;

/**
 * Score history for unlocked sessions (blueprint §5 extension):
 * - daily summaries (top-3 + average of top-N) for the archive view
 * - per-coin score/rank trend series for sparklines on today's top-N coins
 * Strictly session-gated like /api/rankings — no rows leak without payment.
 */
export async function GET() {
  const session = await readSessionCookie();
  if (!session || session.scope !== "read:rankings") {
    return NextResponse.json({ error: "نشست معتبر نیست." }, { status: 401 });
  }
  const rec = await db.sessionRecord.findUnique({ where: { id: session.id } });
  if (!rec || rec.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "نشست منقضی شده است." }, { status: 401 });
  }

  const snaps = await db.rankingSnapshot.findMany({
    orderBy: { date: "desc" },
    take: MAX_DAYS,
    select: { date: true, computedAt: true, rows: true, scoredCount: true, poolSize: true },
  });
  snaps.reverse(); // oldest → newest

  if (snaps.length === 0) {
    return NextResponse.json({ error: "هنوز اسنپ‌شاتی ثبت نشده است." }, { status: 503 });
  }

  // Trend series only for coins in today's top-N (keeps payload small)
  const current = snaps[snaps.length - 1]!.rows as ScoredRow[];
  const topIds = new Set(current.slice(0, SITE.topN).map((r) => r.id));

  const trends: Record<string, { d: string; s: number; r: number }[]> = {};
  for (const snap of snaps) {
    for (const row of snap.rows as ScoredRow[]) {
      if (!topIds.has(row.id)) continue;
      (trends[row.id] ??= []).push({ d: snap.date, s: Math.round(row.composite * 10) / 10, r: row.rank });
    }
  }

  const snapshots = snaps.map((s) => {
    const rows = s.rows as ScoredRow[];
    const topN = rows.slice(0, SITE.topN);
    const avg = topN.length ? topN.reduce((a, r) => a + r.composite, 0) / topN.length : null;
    return {
      date: s.date,
      computedAt: s.computedAt.toISOString(),
      scoredCount: s.scoredCount,
      poolSize: s.poolSize,
      avgScore: avg != null ? Math.round(avg * 10) / 10 : null,
      top: rows.slice(0, 3).map((r) => ({
        id: r.id,
        name: r.name,
        symbol: r.symbol,
        image: r.image,
        composite: Math.round(r.composite * 10) / 10,
        rank: r.rank,
      })),
    };
  });

  return NextResponse.json(
    { days: snaps.length, snapshots, trends },
    { headers: { "cache-control": "no-store" } }
  );
}
