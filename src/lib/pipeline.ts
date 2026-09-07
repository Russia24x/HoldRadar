import "server-only";
import { db } from "./db";
import { CRITERIA, SITE } from "./config";
import { fetchTopCoins } from "./sources/coingecko";
import { buildDefiDataset } from "./sources/defillama";
import { scorePool, type ScoredRow, type PoolRow } from "./scoring";

/**
 * Daily pipeline (blueprint §5): top-300 universe → join DefiLlama metrics →
 * score → persist snapshot. Mirrors the Worker's scheduled() handler.
 * Runs are guarded by an in-process lock; a snapshot newer than 12h is reused.
 */

const STALE_MS = 12 * 3600_000;

const g = globalThis as unknown as { __hrPipelineRunning?: boolean };

export interface SnapshotView {
  date: string;
  computedAt: string;
  pipelineMs: number;
  poolSize: number;
  scoredCount: number;
  coverage: Record<string, { covered: number; total: number; pct: number }>;
  weights: { key: string; label: string; weight: number; formula: string }[];
  prevDate: string | null;
  rows: ScoredRow[];
}

export async function getLatestSnapshot(): Promise<SnapshotView | null> {
  const snap = await db.rankingSnapshot.findFirst({
    orderBy: { computedAt: "desc" },
  });
  if (!snap) return null;
  return {
    date: snap.date,
    computedAt: snap.computedAt.toISOString(),
    pipelineMs: snap.pipelineMs,
    poolSize: snap.poolSize,
    scoredCount: snap.scoredCount,
    coverage: snap.coverage as SnapshotView["coverage"],
    weights: CRITERIA.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      formula: c.formula,
    })),
    prevDate: snap.prevDate ?? null,
    rows: (snap.rows as ScoredRow[]).slice(0, SITE.topN),
  };
}

export async function snapshotAgeMs(): Promise<number | null> {
  const snap = await db.rankingSnapshot.findFirst({
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });
  if (!snap) return null;
  return Date.now() - snap.computedAt.getTime();
}

export interface PipelineResult {
  ok: boolean;
  status: "ok" | "skipped-fresh" | "already-running" | "error";
  date?: string;
  durationMs?: number;
  poolSize?: number;
  scoredCount?: number;
  error?: string;
}

export async function runPipeline(
  trigger: "stale" | "manual" | "cron",
  force = false
): Promise<PipelineResult> {
  // reuse fresh snapshot unless forced
  if (!force) {
    const age = await snapshotAgeMs();
    if (age != null && age < STALE_MS) {
      return { ok: true, status: "skipped-fresh" };
    }
  }
  if (g.__hrPipelineRunning) return { ok: false, status: "already-running" };
  g.__hrPipelineRunning = true;

  const log = await db.dataFetchLog.create({ data: { status: "running", trigger } });
  const t0 = Date.now();

  try {
    // previous snapshot → TVL trend baseline
    const prev = await db.rankingSnapshot.findFirst({
      orderBy: { computedAt: "desc" },
    });
    const prevTvlMap = new Map<string, number>();
    const prevRankMap = new Map<string, number>();
    if (prev) {
      for (const r of prev.rows as ScoredRow[]) {
        if (r.tvl != null && r.tvl > 0) prevTvlMap.set(r.id, r.tvl);
        if (r.rank != null) prevRankMap.set(r.id, r.rank);
      }
    }

    const [coins, defi] = await Promise.all([
      fetchTopCoins(SITE.poolSize),
      buildDefiDataset(),
    ]);

    const pool: PoolRow[] = coins.map((c) => {
      let defiRec = defi.byGecko.get(c.id) ?? undefined;
      let tvlSource: "protocol" | "chain" | undefined;
      // L1 tokens (SOL, AVX, TRX, …): when no protocol TVL exists, use the
      // chain TVL of the matching network (real DefiLlama /chains data).
      if (!defiRec || !(defiRec.tvl > 0)) {
        const chainTvl = defi.chainTvl.get(c.name.trim().toLowerCase());
        if (chainTvl != null) {
          defiRec = defiRec
            ? { ...defiRec, tvl: chainTvl }
            : { slugs: [], tvl: chainTvl, fees30d: null, revenue30d: null, holderRevenue30d: null, holderRevenue1y: null };
          tvlSource = "chain";
        }
      }
      return {
        ...c,
        defi: defiRec,
        prevTvl: prevTvlMap.get(c.id) ?? null,
        prevRank: prevRankMap.get(c.id) ?? null,
        tvlSource,
      };
    });

    const { rows, coverage } = scorePool(pool);

    const today = new Date().toISOString().slice(0, 10);
    const data = {
      date: today,
      computedAt: new Date(),
      pipelineMs: Date.now() - t0,
      poolSize: pool.length,
      scoredCount: rows.length,
      weightsUsed: CRITERIA.map((c) => ({ key: c.key, weight: c.weight })),
      coverage,
      rows,
      prevDate: prev?.date ?? null,
      sources: {
        coingecko: "coins/markets (top " + SITE.poolSize + ")",
        defillama: ["protocols", "overview/fees:dailyRevenue", "overview/fees:dailyHoldersRevenue"],
      },
    };

    await db.rankingSnapshot.upsert({
      where: { date: today },
      create: data,
      update: {
        computedAt: data.computedAt,
        pipelineMs: data.pipelineMs,
        poolSize: data.poolSize,
        scoredCount: data.scoredCount,
        weightsUsed: data.weightsUsed,
        coverage: data.coverage,
        rows: data.rows,
        prevDate: data.prevDate,
        sources: data.sources,
      },
    });

    const durationMs = Date.now() - t0;
    await db.dataFetchLog.update({
      where: { id: log.id },
      data: { status: "ok", finishedAt: new Date(), poolSize: pool.length, scoredCount: rows.length, durationMs },
    });

    return { ok: true, status: "ok", date: today, durationMs, poolSize: pool.length, scoredCount: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.dataFetchLog.update({
      where: { id: log.id },
      data: { status: "error", finishedAt: new Date(), error: msg },
    });
    return { ok: false, status: "error", error: msg };
  } finally {
    g.__hrPipelineRunning = false;
  }
}

/** Fire-and-forget stale refresh (used by public endpoints). */
export async function refreshIfStale(): Promise<void> {
  try {
    const age = await snapshotAgeMs();
    if (age == null || age > STALE_MS) {
      void runPipeline("stale");
    }
  } catch {
    /* background best-effort */
  }
}
