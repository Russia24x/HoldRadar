"use client";

/**
 * Lightweight injected-wallet helpers (no heavy SDKs). Works with:
 *  - Solana: Phantom / Solflare / Backpack (window.phantom.solana | window.solana | window.solflare | window.backpack)
 *  - EVM (Abstract via any EIP-1193 wallet incl. AGW): window.ethereum
 * Everything else (on-chain verification) happens server-side.
 */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function bs58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (let i = 0; bytes[i] === 0 && i < bytes.length - 1; i++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]!];
  return out;
}

export interface SolanaWallet {
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (message: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array }>;
}

export interface EvmWallet {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export function getSolanaWallet(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const phantom = (w.phantom as Record<string, unknown> | undefined)?.solana as SolanaWallet | undefined;
  const sol = (w.solana as SolanaWallet | undefined) ?? phantom;
  const solflare = (w.solflare as SolanaWallet | undefined) ?? undefined;
  const backpack = (w.backpack as SolanaWallet | undefined) ?? undefined;
  if (sol && typeof sol.signMessage === "function") return sol;
  if (solflare && typeof solflare.signMessage === "function") return solflare;
  if (backpack && typeof backpack.signMessage === "function") return backpack;
  return null;
}

export function getEvmWallet(): EvmWallet | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const eth = w.ethereum as EvmWallet | undefined;
  if (eth && typeof eth.request === "function") return eth;
  return null;
}

/** EIP-1193: switch/add Abstract chain (id 2741). */
export async function ensureAbstractChain(wallet: EvmWallet): Promise<void> {
  const abstractHexId = "0xab5";
  try {
    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: abstractHexId }],
    });
  } catch (e) {
    const err = e as { code?: number };
    if (err.code === 4902) {
      await wallet.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: abstractHexId,
            chainName: "Abstract",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://api.mainnet.abs.xyz"],
            blockExplorerUrls: ["https://explorer.mainnet.abs.xyz"],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

/** personal_sign and return the hex signature. */
export async function evmSignMessage(wallet: EvmWallet, address: string, message: string): Promise<string> {
  const sig = (await wallet.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  return sig;
}

/** ERC-20 transfer calldata for USDC.e style payments. */
export function erc20TransferData(to: string, amount: bigint): string {
  const addr = to.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const amt = amount.toString(16).padStart(64, "0");
  return "0xa9059cbb" + addr + amt;
}
