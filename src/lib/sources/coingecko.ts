import "server-only";

/**
 * CoinGecko public API client (free tier, no key, no credit card).
 * Budget: 10k calls/month, 100/min — we call it once per pipeline run
 * (2 requests for the top-300 pool) + spot prices on payment verification.
 */

const BASE = "https://api.coingecko.com/api/v3";
const TTL_MS = 5 * 60_000; // in-memory cache 5 min

export interface CoinMarkets {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  price_change_percentage_90d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

interface CacheEntry<T> {
  t: number;
  v: T;
}

const store = globalThis as unknown as { __hrCgCache?: Map<string, CacheEntry<unknown>> };
const cache: Map<string, CacheEntry<unknown>> = store.__hrCgCache ?? new Map();
store.__hrCgCache = cache;

/** fetch with 3 retry attempts + exponential backoff (429/5xx aware). */
async function cachedJson<T>(key: string, url: string, ttl = TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v as T;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "HoldRadar/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`CoinGecko ${res.status} (attempt ${attempt})`);
      }
      if (!res.ok) throw new Error(`CoinGecko ${res.status} for ${key}`);
      const v = (await res.json()) as T;
      cache.set(key, { t: Date.now(), v });
      return v;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("CoinGecko failed");
}

/** Top N coins by market cap (fixed per_page=250, page semantics → slice). */
export async function fetchTopCoins(n: number): Promise<CoinMarkets[]> {
  const pages = Math.ceil(n / 250);
  const jobs: Promise<CoinMarkets[]>[] = [];
  for (let p = 1; p <= pages; p++) {
    const url =
      `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc` +
      `&per_page=250&page=${p}&sparkline=false` +
      `&price_change_percentage=30d,90d&locale=en`;
    jobs.push(cachedJson<CoinMarkets[]>(`markets:${n}:${p}:v2`, url, 60 * 60_000));
  }
  const results = await Promise.all(jobs);
  const seen = new Set<string>();
  return results
    .flat()
    .filter((c) => {
      if (!c.id || c.market_cap == null || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .slice(0, n);
}

/** Spot price map for payment validation: { coingeckoId → usd } */
export async function fetchPrices(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const url = `${BASE}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`;
  const raw = await cachedJson<Record<string, { usd?: number }>>("prices:" + ids.join(","), url, 60_000);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (v?.usd != null) out[k] = v.usd;
  return out;
}
