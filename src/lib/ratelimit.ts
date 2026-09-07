/**
 * In-memory sliding-window rate limiter (single-instance, like the Worker KV
 * write-window from the blueprint). Persists across hot reloads in dev.
 */

interface Bucket {
  hits: number[];
}

const globalStore = globalThis as unknown as { __hrRateBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = globalStore.__hrRateBuckets ?? new Map();
globalStore.__hrRateBuckets = buckets;

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    const retryAfterSec = Math.ceil((windowMs - (now - b.hits[0])) / 1000);
    return { ok: false, remaining: 0, retryAfterSec };
  }
  b.hits.push(now);
  buckets.set(key, b);
  // opportunistic cleanup
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.hits.every((t) => now - t > windowMs)) buckets.delete(k);
    }
  }
  return { ok: true, remaining: limit - b.hits.length, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
