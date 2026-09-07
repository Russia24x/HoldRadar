import "server-only";
import { CHAINS, type AssetSpec } from "../config";
import { fetchPrices } from "../sources/coingecko";

/**
 * On-chain Solana payment verification (blueprint §6.3) — the server itself
 * acts as the settlement verifier using public JSON-RPC (no third-party
 * facilitator, no account). Works for native SOL transfers (account balance
 * delta of the treasury) and SPL transfers (pre/post token balances).
 */

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

interface RpcRes<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
  const j = (await res.json()) as RpcRes<T>;
  if (j.error) throw new Error(`Solana RPC error: ${j.error.message}`);
  return j.result as T;
}

interface SolanaTx {
  slot: number;
  meta: {
    err: unknown | null;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances:
      | {
          accountIndex: number;
          mint: string;
          owner?: string;
          uiTokenAmount: { amount: string; decimals: number };
        }[]
      | null;
    postTokenBalances:
      | {
          accountIndex: number;
          mint: string;
          owner?: string;
          uiTokenAmount: { amount: string; decimals: number };
        }[]
      | null;
  } | null;
  transaction: {
    message: {
      accountKeys: { pubkey: string; signer?: boolean; writable?: boolean }[];
    };
  };
  blockTime?: number | null;
}

export interface VerifyResult {
  ok: boolean;
  code?: "TX_NOT_FOUND" | "TX_FAILED" | "WRONG_ASSET" | "INSUFFICIENT" | "PRICE_UNAVAILABLE";
  message?: string;
  amountRaw?: string;
  amountUsd?: number;
  payer?: string;
}

function isValidBase58(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(s);
}

export async function verifySolanaPayment(
  txHash: string,
  asset: AssetSpec
): Promise<VerifyResult> {
  if (!isValidBase58(txHash)) return { ok: false, code: "TX_NOT_FOUND", message: "هش تراکنش نامعتبر است." };

  let tx: SolanaTx;
  try {
    tx = await rpc<SolanaTx>("getTransaction", [
      txHash,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
  } catch {
    return { ok: false, code: "TX_NOT_FOUND", message: "تراکنش روی شبکهٔ سولانا پیدا نشد (یا RPC در دسترس نیست)." };
  }
  if (!tx || !tx.meta) return { ok: false, code: "TX_NOT_FOUND", message: "تراکنش پیدا نشد." };
  if (tx.meta.err) return { ok: false, code: "TX_FAILED", message: "تراکنش ناموفق بوده است." };

  const chain = CHAINS.solana;
  const treasury = chain.treasury;

  let amountRaw: number;
  let payer: string | undefined;

  if (asset.kind === "native") {
    // treasury balance delta (captures transfers regardless of instruction shape)
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
    let delta = 0;
    let idx = keys.indexOf(treasury);
    if (idx === -1) {
      // maybe treasury is a writable account not in static keys (rare w/ v0)
      return { ok: false, code: "WRONG_ASSET", message: "خزانه در تراکنش وجود ندارد." };
    }
    delta = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
    if (delta <= 0) return { ok: false, code: "WRONG_ASSET", message: "واریزی به خزانه در این تراکنش دیده نشد." };
    // payer = first signer whose balance decreased
    keys.forEach((k, i) => {
      if (!payer && tx.transaction.message.accountKeys[i]?.signer) {
        if (tx.meta!.postBalances[i] < tx.meta!.preBalances[i]) payer = k;
      }
    });
    amountRaw = delta;
  } else {
    // SPL: token balance delta for accounts owned by treasury with expected mint
    const pre = new Map<number, (typeof tx.meta.preTokenBalances)[number]>();
    (tx.meta.preTokenBalances ?? []).forEach((b) => pre.set(b.accountIndex, b));
    const post = tx.meta.postTokenBalances ?? [];
    let deltaUnits = 0;
    for (const b of post) {
      const before = pre.get(b.accountIndex);
      const beforeAmt = before ? Number(before.uiTokenAmount.amount) : 0;
      const afterAmt = Number(b.uiTokenAmount.amount);
      const d = afterAmt - beforeAmt;
      if (d > 0 && b.mint === asset.contract && b.owner === treasury) {
        deltaUnits += d;
      }
    }
    if (deltaUnits <= 0) {
      return { ok: false, code: "WRONG_ASSET", message: "واریز توکن موردنظر به خزانه در این تراکنش دیده نشد." };
    }
    amountRaw = deltaUnits;
  }

  /* ---- amount validation in USD ---- */
  const requiredUsd = chain ? 0.98 : 1; // tolerance: accept ≥ 98% of $1
  let amountUsd: number;
  if (asset.stable) {
    amountUsd = amountRaw / 10 ** asset.decimals;
  } else {
    if (!asset.coingeckoId) return { ok: false, code: "PRICE_UNAVAILABLE", message: "قیمت لحظه‌ای دارایی در دسترس نیست." };
    const prices = await fetchPrices([asset.coingeckoId]);
    const p = prices[asset.coingeckoId];
    if (!p) return { ok: false, code: "PRICE_UNAVAILABLE", message: "قیمت لحظه‌ای در دسترس نیست؛ دوباره تلاش کنید." };
    amountUsd = (amountRaw / 10 ** asset.decimals) * p;
  }

  if (amountUsd < requiredUsd) {
    return {
      ok: false,
      code: "INSUFFICIENT",
      message: `مبلغ تراکنش ${amountUsd.toFixed(2)} دلار است؛ حداقل لازم ${requiredUsd.toFixed(2)} دلار.`,
      amountUsd,
      amountRaw: String(amountRaw),
    };
  }

  return {
    ok: true,
    amountRaw: String(amountRaw),
    amountUsd: Math.round(amountUsd * 100) / 100,
    payer,
  };
}
