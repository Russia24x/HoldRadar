import "server-only";
import { CRITERIA, SITE } from "./config";
import type { CoinMarkets } from "./sources/coingecko";
import type { DefiData } from "./sources/defillama";

/**
 * «امتیاز ارزش برای هولدر» — composite score engine.
 *
 * Every sub-criterion is min-max normalized to 0..100 against the day's
 * candidate pool. Missing data drops the criterion and redistributes its
 * weight proportionally (blueprint §5.3). Values that ARE reported as 0 stay
 * 0 (real data); null means "no data" → «داده در دسترس نیست».
 */

export interface SubScore {
  score: number; // 0..100 normalized
  value: number | null; // human-readable raw value used for ranking
  note?: string;
}

export interface ScoredRow {
  rank: number;
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  fdv: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  // raw factors (displayed in UI; null = data not available)
  holderYieldAnnual: number | null; // e.g. 0.0312 = 3.12%/yr
  holderShare: number | null; // 0..1
  circRatio: number | null; // 0..1 (circ/max or mcap/fdv blend inputs)
  mcapFdvRatio: number | null; // 0..1
  priceChange90d: number | null; // %
  tvl: number | null;
  tvlGrowth30d: number | null; // % vs previous snapshot (null first day)
  // normalized sub-scores
  sub: Partial<Record<(typeof CRITERIA)[number]["key"], SubScore>>;
  composite: number; // 0..100
  effectiveWeights: Record<string, number>; // after redistribution for this row
}

export interface PoolRow extends CoinMarkets {
  defi?: DefiData["byGecko"] extends Map<string, infer V> ? V : never;
  prevTvl?: number | null;
}

/* ---------------- helpers ---------------- */

function winsorize(vals: number[], p = 0.95): { min: number; max: number } {
  if (vals.length === 0) return { min: 0, max: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { min: lo, max: hi === lo ? lo + 1e-12 : hi };
}

function minMax(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 50;
  if (max <= min) return 50;
  const x = (v - min) / (max - min);
  return Math.max(0, Math.min(100, x * 100));
}

/** lower-is-better → higher-is-better score */
function minMaxInv(v: number, min: number, max: number): number {
  return 100 - minMax(v, min, max);
}

const num = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : x;

/* ---------------- scoring ---------------- */

export interface ScoreResult {
  rows: ScoredRow[]; // sorted desc by composite, rank assigned
  coverage: Record<string, { covered: number; total: number; pct: number }>;
}

export function scorePool(pool: PoolRow[]): ScoreResult {
  /* --- gather raw values per criterion --- */
  const raws = {
    realYield: [] as number[],
    scarcity: [] as number[],
    holderShare: [] as number[],
    maturityStability: [] as number[], // |90d change| — lower better
    maturityRank: [] as number[], // mcap rank — lower better
    tvlSize: [] as number[], // log10(tvl)
    tvlGrowth: [] as number[], // % — higher better
  };

  for (const c of pool) {
    const holderRev30d = num(c.defi?.holderRevenue30d ?? null);
    const mcap = num(c.market_cap);
    if (holderRev30d != null && mcap && mcap > 0) {
      raws.realYield.push(((holderRev30d * 12) / mcap) * 100);
    }
    const circ = num(c.circulating_supply);
    const maxS = num(c.max_supply) ?? num(c.total_supply);
    const fdv = num(c.fully_diluted_valuation);
    if (circ != null && maxS && maxS > 0) {
      // scarcity component 1: share of supply already circulating
      raws.scarcity.push(circ / maxS);
    } else if (mcap != null && fdv && fdv > 0) {
      raws.scarcity.push(mcap / fdv);
    }
    const rev30d = num(c.defi?.revenue30d ?? null);
    const hrev30d = num(c.defi?.holderRevenue30d ?? null);
    if (hrev30d != null && rev30d != null && rev30d > 0) {
      raws.holderShare.push(Math.max(0, Math.min(1, hrev30d / rev30d)));
    }
    const pc90 = num(c.price_change_percentage_90d_in_currency);
    if (pc90 != null) raws.maturityStability.push(Math.abs(pc90));
    const rank = num(c.market_cap_rank);
    if (rank != null) raws.maturityRank.push(rank);
    const tvl = num(c.defi?.tvl ?? null);
    if (tvl != null && tvl > 0) raws.tvlSize.push(Math.log10(tvl));
    const prev = num(c.prevTvl ?? null);
    if (tvl != null && tvl > 0 && prev != null && prev > 0) {
      raws.tvlGrowth.push(((tvl - prev) / prev) * 100);
    }
  }

  const wRealYield = winsorize(raws.realYield);
  const wScarcity = winsorize(raws.scarcity);
  const wHolderShare = winsorize(raws.holderShare);
  const wStability = winsorize(raws.maturityStability);
  const wRank = winsorize(raws.maturityRank);
  const wTvlSize = winsorize(raws.tvlSize);
  const wTvlGrowth = winsorize(raws.tvlGrowth);

  /* --- per-row sub-scores --- */
  const rows: ScoredRow[] = pool.map((c) => {
    const mcap = num(c.market_cap);
    const holderRev30d = num(c.defi?.holderRevenue30d ?? null);
    const rev30d = num(c.defi?.revenue30d ?? null);
    const circ = num(c.circulating_supply);
    const maxS = num(c.max_supply) ?? num(c.total_supply);
    const fdv = num(c.fully_diluted_valuation);
    const pc90 = num(c.price_change_percentage_90d_in_currency);
    const rank = num(c.market_cap_rank);
    const tvl = num(c.defi?.tvl ?? null);
    const prev = num(c.prevTvl ?? null);

    const sub: ScoredRow["sub"] = {};

    // 1) realYield
    const holderYieldAnnual: number | null =
      holderRev30d != null && mcap && mcap > 0 ? (holderRev30d * 12) / mcap : null;
    if (holderYieldAnnual != null) {
      sub.realYield = {
        score: minMax(holderYieldAnnual * 100, wRealYield.min, wRealYield.max),
        value: holderYieldAnnual,
      };
    }

    // 2) scarcity — average of circ/max and mcap/fdv (whichever available)
    const circRatio = circ != null && maxS && maxS > 0 ? circ / maxS : null;
    const mcapFdvRatio = mcap != null && fdv && fdv > 0 ? mcap / fdv : null;
    const parts: number[] = [];
    if (circRatio != null) parts.push(circRatio);
    if (mcapFdvRatio != null) parts.push(mcapFdvRatio);
    if (parts.length > 0) {
      const blend = parts.reduce((a, b) => a + b, 0) / parts.length;
      sub.scarcity = {
        score: minMax(blend, wScarcity.min, wScarcity.max),
        value: blend,
        note: parts.length === 2 ? "میانگین circ/max و mcap/FDV" : parts.length === 1 && circRatio != null ? "فقط circ/max" : "فقط mcap/FDV",
      };
    }

    // 3) holderShare (buyback/burn/holder distributions)
    let holderShare: number | null = null;
    if (holderRev30d != null && rev30d != null && rev30d > 0) {
      holderShare = Math.max(0, Math.min(1, holderRev30d / rev30d));
    }
    if (holderShare != null) {
      sub.holderShare = {
        score: minMax(holderShare, wHolderShare.min, wHolderShare.max),
        value: holderShare,
      };
    }

    // 4) maturity — stability (inverted |90d|) + rank (inverted), averaged
    const comps: { score: number; weight: number }[] = [];
    if (pc90 != null) comps.push({ score: minMaxInv(Math.abs(pc90), wStability.min, wStability.max), weight: 0.5 });
    if (rank != null) comps.push({ score: minMaxInv(rank, wRank.min, wRank.max), weight: 0.5 });
    if (comps.length > 0) {
      const tw = comps.reduce((a, b) => a + b.weight, 0);
      const s = comps.reduce((a, b) => a + (b.score * b.weight) / tw, 0);
      sub.maturity = { score: s, value: s };
    }

    // 5) ecosystem — tvl size + growth
    const ecoComps: { score: number; weight: number }[] = [];
    if (tvl != null && tvl > 0) {
      ecoComps.push({ score: minMax(Math.log10(tvl), wTvlSize.min, wTvlSize.max), weight: 0.6 });
    }
    let tvlGrowth30d: number | null = null;
    if (tvl != null && tvl > 0 && prev != null && prev > 0) {
      tvlGrowth30d = ((tvl - prev) / prev) * 100;
      ecoComps.push({ score: minMax(tvlGrowth30d, wTvlGrowth.min, wTvlGrowth.max), weight: 0.4 });
    }
    if (ecoComps.length > 0) {
      const tw = ecoComps.reduce((a, b) => a + b.weight, 0);
      const s = ecoComps.reduce((a, b) => a + (b.score * b.weight) / tw, 0);
      sub.ecosystem = {
        score: s,
        value: tvl,
        note: tvlGrowth30d == null ? "اندازه TVL (روند در دسترس نیست)" : "اندازه + روند ۳۰روزه TVL",
      };
    }

    /* weighted composite with redistribution */
    let weightSum = 0;
    let acc = 0;
    const effectiveWeights: Record<string, number> = {};
    for (const crit of CRITERIA) {
      const s = sub[crit.key];
      if (s == null) continue;
      weightSum += crit.weight;
      acc += crit.weight * s.score;
      effectiveWeights[crit.key] = crit.weight;
    }
    // redistribute missing weight proportionally
    for (const crit of CRITERIA) {
      if (sub[crit.key] == null) continue;
      effectiveWeights[crit.key] = weightSum > 0 ? crit.weight / weightSum : crit.weight;
    }
    const composite = weightSum > 0 ? acc / weightSum : 0;

    return {
      rank: 0,
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      image: c.image ?? "",
      price: num(c.current_price),
      marketCap: mcap,
      marketCapRank: rank,
      fdv,
      circulatingSupply: circ,
      maxSupply: num(c.max_supply),
      holderYieldAnnual,
      holderShare,
      circRatio,
      mcapFdvRatio,
      priceChange90d: pc90,
      tvl,
      tvlGrowth30d,
      sub,
      composite: Math.round(composite * 10) / 10,
      effectiveWeights,
    };
  });

  rows.sort((a, b) => b.composite - a.composite);
  rows.forEach((r, i) => (r.rank = i + 1));

  // coverage stats (honest reporting, shown in methodology)
  const coverage: Record<string, { covered: number; total: number; pct: number }> = {};
  for (const crit of CRITERIA) {
    const covered = rows.filter((r) => r.sub[crit.key] != null).length;
    coverage[crit.key] = { covered, total: rows.length, pct: rows.length ? Math.round((covered / rows.length) * 100) : 0 };
  }

  return { rows, coverage };
}

export const TOP_N = SITE.topN;
