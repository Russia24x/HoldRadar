/** Client-side types mirroring the API contracts (server types are not
 * importable here because they carry "server-only" guards). */

export interface AssetRequirement {
  symbol: string;
  contract: string | null;
  decimals: number;
  stable: boolean;
}

export interface ChainRequirement {
  network: string;
  label: string;
  treasury: string;
  assets: AssetRequirement[];
}

export interface PaymentRequirements {
  price: string;
  maxAgeHours: number;
  chains: ChainRequirement[];
  note: string;
}

export interface StatusResponse {
  locked: boolean;
  sessionExpiresAt: number | null;
  priceUsd: number;
  topN: number;
  lastComputedAt: string | null;
  snapshotDate: string | null;
  poolSize: number | null;
  ageHours: number | null;
  prices: Record<string, number>;
  requirements: PaymentRequirements;
  sources: { pricing: string; defi: string };
}

export interface SubScore {
  score: number;
  value: number | null;
  note?: string;
}

export interface RankRow {
  rank: number;
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  fdv: number | null;
  holderYieldAnnual: number | null;
  holderShare: number | null;
  circRatio: number | null;
  mcapFdvRatio: number | null;
  priceChange90d: number | null;
  tvl: number | null;
  tvlGrowth30d: number | null;
  prevRank: number | null;
  rankChange: number | null; // positive = up vs yesterday
  sub: Partial<Record<string, SubScore>>;
  composite: number;
  effectiveWeights: Record<string, number>;
}

export interface RankingsResponse {
  date: string;
  computedAt: string;
  pipelineMs: number;
  poolSize: number;
  scoredCount: number;
  coverage: Record<string, { covered: number; total: number; pct: number }>;
  weights: { key: string; label: string; weight: number; formula: string }[];
  prevDate: string | null;
  rows: RankRow[];
  sessionExpiresAt: number;
}
