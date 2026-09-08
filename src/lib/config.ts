/**
 * HoldRadar public configuration.
 *
 * Contains ONLY public values (treasury addresses, accepted assets, scoring
 * weights). Safe to import from client and server. Secrets live exclusively
 * in environment variables on the server (see .env.local / wrangler secrets).
 */

export const SITE = {
  name: "HoldRadar",
  faName: "هولدرادار",
  tagline: "رادار ارزش برای هولدر",
  priceUsd: 1.0,
  topN: 25,
  poolSize: 300, // candidate universe = top 300 by market cap (CoinGecko)
  sessionHours: 24,
} as const;

/* ------------------------------------------------------------------ */
/* Payment networks (x402-style "accepts" list)                        */
/* ------------------------------------------------------------------ */

export type ChainKey = "abstract" | "solana";

export interface AssetSpec {
  symbol: string;
  kind: "native" | "erc20" | "spl";
  /** contract / mint address (empty for native) */
  contract: string;
  decimals: number;
  /** stablecoin flag → verification uses exact 1.00 USD, else price feed with tolerance */
  stable: boolean;
  coingeckoId?: string;
}

export interface ChainSpec {
  key: ChainKey;
  label: string;
  labelEn: string;
  networkId: string; // x402 network identifier
  chainId?: number; // EVM chain id
  treasury: string;
  explorerTx: (hash: string) => string;
  assets: AssetSpec[];
}

export const CHAINS: Record<ChainKey, ChainSpec> = {
  abstract: {
    key: "abstract",
    label: "Abstract",
    labelEn: "Abstract",
    networkId: "eip155:2741",
    chainId: 2741,
    treasury: "0x60Df4E186364c3a49A550Aee29Da1d5fe3658818",
    explorerTx: (h) => `https://abscan.org/tx/${h}`,
    assets: [
      {
        symbol: "ETH",
        kind: "native",
        contract: "",
        decimals: 18,
        stable: false,
        coingeckoId: "ethereum",
      },
      {
        symbol: "USDC.e",
        kind: "erc20",
        // verified live on-chain (docs.abs.xyz/tooling/deployed-contracts, symbol() == "USDC.e", 6 decimals)
        contract: "0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1",
        decimals: 6,
        stable: true,
      },
    ],
  },
  solana: {
    key: "solana",
    label: "سولانا",
    labelEn: "Solana",
    networkId: "solana:mainnet",
    treasury: "4WN59xCyUtbnCR1MgTZHiG8XLDNGrKm9FfXAQp7soqrr",
    explorerTx: (h) => `https://solscan.io/tx/${h}`,
    assets: [
      {
        symbol: "SOL",
        kind: "native",
        contract: "",
        decimals: 9,
        stable: false,
        coingeckoId: "solana",
      },
      {
        symbol: "PENGU",
        kind: "spl",
        // official Pengu SPL mint
        contract: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
        decimals: 6,
        stable: false,
        coingeckoId: "pudgy-penguins",
      },
      {
        symbol: "USDC",
        kind: "spl",
        contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6,
        stable: true,
        coingeckoId: "usd-coin",
      },
    ],
  },
};

/** x402-style payment requirements returned with HTTP 402
 *  (docs.abs.xyz/ai-agents/payments/x402 — "accepts" list mirrors the
 *   x402 exact scheme: scheme/price/network/payTo). */
export function paymentRequirements() {
  return {
    price: `$${SITE.priceUsd.toFixed(2)}`,
    maxAgeHours: SITE.sessionHours,
    /** x402-compatible accepts list (scheme "exact" on each chain/asset) */
    accepts: Object.values(CHAINS).flatMap((c) =>
      c.assets.map((a) => ({
        scheme: "exact",
        price: `$${SITE.priceUsd.toFixed(2)}`,
        network: c.networkId,
        payTo: c.treasury,
        asset:
          a.kind === "native"
            ? { symbol: a.symbol, decimals: a.decimals }
            : { symbol: a.symbol, address: a.contract, decimals: a.decimals },
        description: "HoldRadar daily top-25 holder-value ranking (24h session)",
        maxAgeSeconds: 600,
      }))
    ),
    chains: Object.values(CHAINS).map((c) => ({
      network: c.networkId,
      label: c.label,
      treasury: c.treasury,
      assets: c.assets.map((a) => ({
        symbol: a.symbol,
        contract: a.contract || null,
        decimals: a.decimals,
        stable: a.stable,
      })),
    })),
    note: "پس از واریز، هش تراکنش را ثبت کنید تا روی زنجیره راستی‌آزمایی شود.",
  };
}

/* ------------------------------------------------------------------ */
/* Scoring formula (weights are public, shown in Methodology page)     */
/* ------------------------------------------------------------------ */

export const CRITERIA = [
  {
    key: "realYield",
    label: "بازده واقعی هولدر",
    labelEn: "Real Yield",
    weight: 0.3,
    formula: "درآمد ۳۰روزهٔ رسیده به هولدرها (DefiLlama) × ۱۲ ÷ ارزش بازار",
  },
  {
    key: "scarcity",
    label: "کمیابی و انتشار",
    labelEn: "Scarcity / Emission",
    weight: 0.2,
    formula:
      "نسبت عرضهٔ در گردش به حداکثر + نسبت ارزش بازار به FDV (CoinGecko)",
  },
  {
    key: "holderShare",
    label: "بازخرید، سوزاندن و سهم هولدر",
    labelEn: "Buyback & Burn / Holder Share",
    weight: 0.2,
    formula:
      "سهم درآمد هولدرها از کل درآمد پروتکل: درآمد هولدر ۳۰روزه ÷ کل درآمد ۳۰روزه (DefiLlama)",
  },
  {
    key: "maturity",
    label: "ذخیرهٔ ارزش و بلوغ",
    labelEn: "Store of Value / Maturity",
    weight: 0.15,
    formula: "پایداری قیمت ۹۰روزه (کمتر بودن دامنهٔ تغییر) + رتبهٔ ارزش بازار",
  },
  {
    key: "ecosystem",
    label: "اندازه و رشد اکوسیستم",
    labelEn: "TVL / Ecosystem",
    weight: 0.15,
    formula: "ارزش کل قفل‌شده (DefiLlama) + روند ۳۰روزهٔ TVL از اسنپ‌شات‌های روزانه",
  },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];
