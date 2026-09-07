import "server-only";

/**
 * DefiLlama public API client (fully free, no key).
 * The whole daily pipeline needs only 3 calls:
 *   /protocols                        → gecko_id ↔ slug map + TVL
 *   /overview/fees?dataType=dailyRevenue        → protocol revenue 30d
 *   /overview/fees?dataType=dailyHoldersRevenue → holder revenue 30d
 */

const BASE = "https://api.llama.fi";

export interface ProtocolEntry {
  name?: string;
  slug?: string;
  gecko_id?: string | null;
  symbol?: string;
  tvl?: number | null;
  chainTvls?: Record<string, number>;
}

export interface FeesEntry {
  slug?: string;
  name?: string;
  displayName?: string;
  total24h?: number | null;
  total30d?: number | null;
  total7d?: number | null;
  total1y?: number | null;
}

const TTL = 30 * 60_000;

interface CacheEntry<T> {
  t: number;
  v: T;
}
const store = globalThis as unknown as { __hrDlCache?: Map<string, CacheEntry<unknown>> };
const cache: Map<string, CacheEntry<unknown>> = store.__hrDlCache ?? new Map();
store.__hrDlCache = cache;

async function cachedJson<T>(key: string, url: string, ttl = TTL): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v as T;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "HoldRadar/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`DefiLlama ${res.status} for ${key}`);
  const v = (await res.json()) as T;
  cache.set(key, { t: Date.now(), v });
  return v;
}

export async function fetchProtocols(): Promise<ProtocolEntry[]> {
  const v = await cachedJson<ProtocolEntry[]>("protocols", `${BASE}/protocols`);
  return Array.isArray(v) ? v : [];
}

export async function fetchFeesOverview(
  dataType: "dailyFees" | "dailyRevenue" | "dailyHoldersRevenue"
): Promise<FeesEntry[]> {
  const url =
    `${BASE}/overview/fees?excludeTotalDataChart=true` +
    `&excludeTotalDataChartBreakdown=true&dataType=${dataType}`;
  const v = await cachedJson<{ protocols?: FeesEntry[] }>(`fees:${dataType}`, url);
  return v?.protocols ?? [];
}

export interface DefiData {
  /** gecko_id → aggregated protocol metrics */
  byGecko: Map<string, {
    slugs: string[];
    tvl: number;
    fees30d: number | null;
    revenue30d: number | null;
    holderRevenue30d: number | null;
    holderRevenue1y: number | null;
  }>;
  /** chain name (lowercase) → chain TVL (for L1 tokens like SOL / AVAX / TRX) */
  chainTvl: Map<string, number>;
}

interface ChainEntry {
  name?: string;
  tokenSymbol?: string;
  tvl?: number | null;
}

async function fetchChains(): Promise<Map<string, number>> {
  try {
    const v = await cachedJson<ChainEntry[]>("chains", `${BASE}/chains`, 60 * 60_000);
    const m = new Map<string, number>();
    for (const c of v ?? []) {
      if (c.name && c.tvl && c.tvl > 0) m.set(c.name.toLowerCase(), c.tvl);
    }
    return m;
  } catch {
    return new Map();
  }
}

/** Build the gecko-indexed DefiLlama dataset (3 requests). */
export async function buildDefiDataset(): Promise<DefiData> {
  const [protocols, fees, revenue, holders, chainTvl] = await Promise.all([
    fetchProtocols(),
    fetchFeesOverview("dailyFees"),
    fetchFeesOverview("dailyRevenue"),
    fetchFeesOverview("dailyHoldersRevenue"),
    fetchChains(),
  ]);

  const bySlug = new Map<string, { gecko?: string; tvl: number }>();
  for (const p of protocols) {
    if (!p.gecko_id) continue;
    const tvl = p.tvl ?? 0;
    const prev = bySlug.get(p.slug ?? "");
    // Aggregate TVL for protocols sharing one gecko id (e.g. uniswap v1/v2/v3)
    const gk = (prev?.gecko ? null : p.gecko_id) ?? prev?.gecko;
    bySlug.set(p.slug ?? `${p.name}`, { gecko: gk ?? p.gecko_id, tvl: (prev?.tvl ?? 0) + tvl });
  }

  const feeBySlug = (list: FeesEntry[]) => {
    const m = new Map<string, FeesEntry>();
    for (const e of list) if (e.slug) m.set(e.slug, e);
    return m;
  };
  const feesM = feeBySlug(fees);
  const revM = feeBySlug(revenue);
  const holdM = feeBySlug(holders);

  const byGecko = new Map<
    string,
    {
      slugs: string[];
      tvl: number;
      fees30d: number | null;
      revenue30d: number | null;
      holderRevenue30d: number | null;
      holderRevenue1y: number | null;
    }
  >();

  for (const p of protocols) {
    if (!p.gecko_id) continue;
    const slug = p.slug ?? "";
    const rec =
      byGecko.get(p.gecko_id) ??
      { slugs: [], tvl: 0, fees30d: null, revenue30d: null, holderRevenue30d: null, holderRevenue1y: null };
    rec.slugs.push(slug);
    rec.tvl += p.tvl ?? 0;
    const f = feesM.get(slug);
    const r = revM.get(slug);
    const h = holdM.get(slug);
    if (f?.total30d != null) rec.fees30d = (rec.fees30d ?? 0) + f.total30d;
    if (r?.total30d != null) rec.revenue30d = (rec.revenue30d ?? 0) + r.total30d;
    if (h?.total30d != null) rec.holderRevenue30d = (rec.holderRevenue30d ?? 0) + h.total30d;
    if (h?.total1y != null) rec.holderRevenue1y = (rec.holderRevenue1y ?? 0) + h.total1y;
    byGecko.set(p.gecko_id, rec);
  }

  void bySlug; // (kept for future per-slug debugging)
  return { byGecko, chainTvl };
}
