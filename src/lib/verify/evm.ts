import "server-only";
import { CHAINS, type AssetSpec } from "../config";
import { fetchPrices } from "../sources/coingecko";

/**
 * On-chain Abstract (EVM, chain 2741) payment verification via public RPC —
 * no external facilitator account needed (blueprint §6.2/§6.3 adapted).
 * Native ETH: tx.value to treasury. ERC-20 (USDC.e): Transfer event log
 * decoded manually (address topic + amount data) — no heavy SDK.
 */

const RPCS = [
  process.env.ABSTRACT_RPC_URL,
  "https://api.mainnet.abs.xyz",
  "https://abstract.drpc.org",
].filter(Boolean) as string[];

interface RpcRes<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastErr: Error | null = null;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as RpcRes<T>;
      if (j.error) throw new Error(j.error.message);
      if (j.result === null || j.result === undefined) throw new Error("null result");
      return j.result as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("RPC failed");
}

interface EvmTx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
}
interface EvmReceipt {
  status: string; // "0x1" ok
  logs: {
    address: string;
    topics: string[];
    data: string;
  }[];
}

function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40);
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface VerifyResult {
  ok: boolean;
  code?: "TX_NOT_FOUND" | "TX_FAILED" | "WRONG_ASSET" | "INSUFFICIENT" | "PRICE_UNAVAILABLE";
  message?: string;
  amountRaw?: string;
  amountUsd?: number;
  payer?: string;
}

const isTxHash = (h: string) => /^0x[a-fA-F0-9]{64}$/.test(h);

export async function verifyAbstractPayment(
  txHash: string,
  asset: AssetSpec
): Promise<VerifyResult> {
  if (!isTxHash(txHash)) return { ok: false, code: "TX_NOT_FOUND", message: "هش تراکنش نامعتبر است." };

  let tx: EvmTx;
  let receipt: EvmReceipt;
  try {
    tx = await rpc<EvmTx>("eth_getTransactionByHash", [txHash]);
    receipt = await rpc<EvmReceipt>("eth_getTransactionReceipt", [txHash]);
  } catch {
    return { ok: false, code: "TX_NOT_FOUND", message: "تراکنش روی شبکهٔ Abstract پیدا نشد (یا RPC در دسترس نیست)." };
  }

  if (receipt.status !== "0x1") return { ok: false, code: "TX_FAILED", message: "تراکنش ناموفق بوده است." };

  const chain = CHAINS.abstract;
  const treasury = chain.treasury.toLowerCase();
  let amountRaw = 0n;

  if (asset.kind === "native") {
    if (!tx.to || tx.to.toLowerCase() !== treasury) {
      return { ok: false, code: "WRONG_ASSET", message: "مقصد تراکنش، آدرس خزانه نیست." };
    }
    amountRaw = BigInt(tx.value);
    if (amountRaw <= 0n) return { ok: false, code: "WRONG_ASSET", message: "مبلغ تراکنش صفر است." };
  } else {
    const token = asset.contract.toLowerCase();
    let found = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== token) continue;
      if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
      const to = topicToAddress(log.topics[2] ?? "").toLowerCase();
      if (to !== treasury) continue;
      const amt = BigInt(log.data);
      if (amt > 0n) {
        amountRaw += amt;
        found = true;
      }
    }
    if (!found) {
      return { ok: false, code: "WRONG_ASSET", message: "انتقال توکن موردنظر به خزانه در این تراکنش دیده نشد." };
    }
  }

  /* USD validation */
  const requiredUsd = 0.98;
  let amountUsd: number;
  if (asset.stable) {
    amountUsd = Number(amountRaw) / 10 ** asset.decimals;
  } else {
    if (!asset.coingeckoId) return { ok: false, code: "PRICE_UNAVAILABLE", message: "قیمت لحظه‌ای در دسترس نیست." };
    const prices = await fetchPrices([asset.coingeckoId]);
    const p = prices[asset.coingeckoId];
    if (!p) return { ok: false, code: "PRICE_UNAVAILABLE", message: "قیمت لحظه‌ای در دسترس نیست؛ دوباره تلاش کنید." };
    amountUsd = (Number(amountRaw) / 10 ** asset.decimals) * p;
  }

  if (amountUsd < requiredUsd) {
    return {
      ok: false,
      code: "INSUFFICIENT",
      message: `مبلغ تراکنش ${amountUsd.toFixed(2)} دلار است؛ حداقل لازم ${requiredUsd.toFixed(2)} دلار.`,
      amountUsd,
      amountRaw: amountRaw.toString(),
    };
  }

  return {
    ok: true,
    amountRaw: amountRaw.toString(),
    amountUsd: Math.round(amountUsd * 100) / 100,
    payer: tx.from,
  };
}
