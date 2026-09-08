import "server-only";
import { CHAINS } from "../config";

/**
 * ERC-1271 (isValidSignature) verification against the Abstract treasury
 * address via public RPC.
 *
 * Why: the Abstract Global Wallet (AGW) is a *smart contract wallet*
 * (docs.abs.xyz/abstract-global-wallet/architecture). When the treasury is
 * controlled by an AGW, an EIP-191 personal_sign signature cannot be
 * recovered to the smart-account address — the signature must be validated
 * on-chain by calling isValidSignature on the claimed address.
 *
 * Both hash conventions are tried, because contract implementations differ:
 *  1. EIP-191 personal-message hash (keccak256("\x19Ethereum Signed Message:\n" + len + msg))
 *  2. raw message hash (keccak256(msg))
 */

const RPCS = [
  process.env.ABSTRACT_RPC_URL,
  "https://api.mainnet.abs.xyz",
  "https://abstract.drpc.org",
].filter(Boolean) as string[];

const ERC1271_MAGIC = "0x1626ba7e";
const ERC1271_SELECTOR = "0x1626ba7e"; // isValidSignature(bytes32,bytes)

function pad32(hexNo0x: string): string {
  return hexNo0x.toLowerCase().padStart(64, "0");
}

/** abi.encodeWithSelector(isValidSignature, hash, signature) */
function erc1271CallData(hash: Uint8Array, signatureHex: string): string {
  const sig = signatureHex.trim().toLowerCase().replace(/^0x/, "");
  const sigBytes = sig.length % 2 === 0 ? sig : "0" + sig;
  const head =
    ERC1271_SELECTOR +
    pad32(Buffer.from(hash).toString("hex")) + // bytes32 _hash
    pad32("40"); // offset of bytes _signature (2 head words)
  const tail = pad32((sigBytes.length / 2).toString(16)) + sigBytes;
  const paddedTail = tail.padEnd(Math.ceil(tail.length / 64) * 64, "0");
  return head + paddedTail;
}

async function ethCall(to: string, data: string): Promise<string | null> {
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to, data }, "latest"],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { result?: string; error?: unknown };
      if (typeof j.result === "string") return j.result;
    } catch {
      // try next RPC
    }
  }
  return null;
}

/**
 * Validate an ERC-1271 signature for the Abstract treasury address.
 * @param message  the exact challenge message string that was signed
 * @param signatureHex  "0x…" signature returned by the wallet
 * @param eip191Hash  precomputed EIP-191 personal-message hash of `message`
 * @param rawHash     precomputed keccak256(message)
 * @returns true when the treasury contract replies with the magic value
 */
export async function erc1271Verify(
  message: string,
  signatureHex: string,
  eip191Hash: Uint8Array,
  rawHash: Uint8Array
): Promise<boolean> {
  const treasury = CHAINS.abstract.treasury;
  const sig = signatureHex.trim().toLowerCase();
  if (!sig.startsWith("0x") || sig.length < 4) return false;

  for (const hash of [eip191Hash, rawHash]) {
    const data = erc1271CallData(hash, sig);
    const result = await ethCall(treasury, data);
    if (result && result.toLowerCase().startsWith(ERC1271_MAGIC)) return true;
    // some contracts return bytes4 at the end (e.g. abi-encoded)
    if (result && result.toLowerCase().slice(-8) === "1626ba7e") return true;
  }
  return false;
}
