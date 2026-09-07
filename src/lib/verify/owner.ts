import "server-only";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { CHAINS, type ChainKey } from "../config";

/**
 * Treasury-owner signature verification (blueprint §7):
 *  - EVM (Abstract): EIP-191 personal_sign recovery → address must equal treasury
 *  - Solana: ed25519 verify over the raw message bytes → signer == treasury
 * Pure-JS crypto (noble) — no wallet SDKs, no third-party service.
 */

const secp = secp256k1 as unknown as {
  Signature: {
    fromBytes(bytes: Uint8Array): {
      addRecoveryBit(bit: number): {
        recoverPublicKey(msgHash: Uint8Array): { toBytes(compressed?: boolean): Uint8Array };
      };
    };
  };
};

const CURVE_N = (secp256k1.Point as unknown as { Fn: { ORDER: bigint } }).Fn.ORDER;
const N_HALF = CURVE_N / 2n;

/** keccak256("\x19Ethereum Signed Message:\n" + len + message) */
export function evmPersonalSignHash(message: string): Uint8Array {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  return keccak_256(new TextEncoder().encode(prefix + message));
}

/**
 * Recover the signer address from a 65-byte Ethereum personal_sign signature
 * ("0x" + r + s + v). Returns checksum-less lowercase address or null.
 */
export function recoverEvmSigner(message: string, signatureHex: string): string | null {
  try {
    const sig = signatureHex.trim().toLowerCase();
    if (!/^0x[a-f0-9]{130}$/.test(sig)) return null;
    const rb = Buffer.from(sig.slice(2, 66), "hex"); // r
    const sb = Buffer.from(sig.slice(66, 130), "hex"); // s
    let v = Number(BigInt("0x" + sig.slice(130, 132)));
    if (v >= 35) v = (v - 2) % 2; // tolerate EIP-155 style v
    let recid = v >= 27 ? v - 27 : v;
    if (recid < 0 || recid > 3) return null;

    // high-S normalization (Ethereum permits non-canonical s)
    let s = BigInt("0x" + sb.toString("hex"));
    const r = BigInt("0x" + rb.toString("hex"));
    if (s > N_HALF) {
      s = CURVE_N - s;
      recid = recid ^ 1;
    }
    const rs = new Uint8Array(64);
    rs.set(new Uint8Array(rb), 0);
    const sHex = s.toString(16).padStart(64, "0");
    rs.set(new Uint8Array(Buffer.from(sHex, "hex")), 32);

    const msgHash = evmPersonalSignHash(message);
    const sigObj = secp.Signature.fromBytes(rs).addRecoveryBit(recid);
    const pubPoint = sigObj.recoverPublicKey(msgHash);
    const uncompressed = pubPoint.toBytes(false); // 65 bytes with 0x04 prefix
    const addrBytes = keccak_256(uncompressed.slice(1)).slice(12);
    return "0x" + Buffer.from(addrBytes).toString("hex");
  } catch {
    return null;
  }
}

/* --------- minimal base58 (Bitcoin alphabet) --------- */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP: Record<string, number> = {};
for (let i = 0; i < B58.length; i++) B58_MAP[B58[i]!] = i;

export function bs58Decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    const val = B58_MAP[ch];
    if (val === undefined) throw new Error("invalid base58 char");
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch === "1") bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

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

/** Verify an ed25519 (Solana) signMessage signature against a claimed signer. */
export function verifySolanaSigner(message: string, signatureB58: string, address: string): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message);
    const sig = bs58Decode(signatureB58.trim());
    const pub = bs58Decode(address.trim());
    if (sig.length !== 64 || pub.length !== 32) return false;
    return ed25519.verify(sig, msgBytes, pub);
  } catch {
    return false;
  }
}

/** Does this address equal the treasury of the given chain? */
export function isTreasuryAddress(chain: ChainKey, address: string): boolean {
  const a = address.trim();
  if (chain === "abstract") return a.toLowerCase() === CHAINS.abstract.treasury.toLowerCase();
  return a === CHAINS.solana.treasury;
}
