import { NextResponse } from "next/server";
import { paymentRequirements, SITE } from "@/lib/config";
import { getLatestSnapshot, refreshIfStale, snapshotAgeMs } from "@/lib/pipeline";
import { readSessionCookie } from "@/lib/session";
import { fetchPrices } from "@/lib/sources/coingecko";
import { CHAINS } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Public status: metadata only — zero ranking rows leak before payment. */
export async function GET() {
  const session = await readSessionCookie();
  void refreshIfStale(); // background daily refresh
  const ageMs = await snapshotAgeMs();
  const snap = await getLatestSnapshot();

  // live spot prices for displaying the exact payable amount per asset
  let prices: Record<string, number> = {};
  try {
    const ids = Object.values(CHAINS)
      .flatMap((c) => c.assets)
      .filter((a) => !a.stable && a.coingeckoId)
      .map((a) => a.coingeckoId as string);
    prices = await fetchPrices(ids);
  } catch {
    prices = {};
  }

  return NextResponse.json(
    {
      locked: !session,
      sessionExpiresAt: session?.expMs ?? null,
      priceUsd: SITE.priceUsd,
      topN: SITE.topN,
      lastComputedAt: snap?.computedAt ?? null,
      snapshotDate: snap?.date ?? null,
      poolSize: snap?.poolSize ?? null,
      ageHours: ageMs != null ? Math.round((ageMs / 3600_000) * 10) / 10 : null,
      requirements: paymentRequirements(),
      prices,
      sources: {
        pricing: "CoinGecko",
        defi: "DefiLlama",
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
