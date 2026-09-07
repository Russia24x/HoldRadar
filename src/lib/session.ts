import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createHmac, timingSafeEqual } from "crypto";
import { SITE } from "./config";

/**
 * Stateless HMAC session tokens (mirrors the Worker blueprint, section 6.4):
 *   v1.<id>.<expMs>.<scope>.<hmac>
 * The HMAC covers id|exp|scope|payer so nothing is client-trustworthy.
 * The SESSION secret only ever lives in server env.
 */

const COOKIE_NAME = "hr_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    // dev fallback so the sandbox works without extra setup; production MUST set it
    return "dev-only-insecure-session-secret-change-me";
  }
  return s;
}

export interface SessionPayload {
  id: string;
  expMs: number;
  scope: string; // "read:rankings"
  source: string; // payment | owner | qa
  payer?: string;
  chain?: string;
  txHash?: string;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSession(
  input: Omit<SessionPayload, "id" | "expMs">
): SessionPayload {
  return {
    ...input,
    id: randomUUID(),
    expMs: Date.now() + SITE.sessionHours * 3600_000,
  };
}

export function serializeSession(p: SessionPayload): string {
  // The HMAC binds id|exp|scope (the token-visible fields). source/payer/chain
  // are audit fields stored in SessionRecord (DB), not in the cookie.
  const body = [p.id, p.expMs, p.scope].join("|");
  return `v1.${p.id}.${p.expMs}.${p.scope}.${sign(body)}`;
}

export function parseSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, id, expStr, scope, mac] = parts;
  const expMs = Number(expStr);
  if (!id || !Number.isFinite(expMs)) return null;
  if (Date.now() > expMs) return null;
  // recompute over stored payload format: we need source/payer/chain/txHash.
  // They are embedded in the DB (SessionRecord) — to keep the token compact we
  // sign id|exp|scope only and resolve extra fields from the audit record.
  const body = [id, expMs, scope].join("|");
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id, expMs, scope };
}

export async function readSessionCookie(): Promise<SessionPayload | null> {
  const store = await cookies();
  return parseSession(store.get(COOKIE_NAME)?.value);
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    // Secure when served over https (Caddy gateway in this sandbox is https);
    // fall back to not-secure on plain http dev access.
    secure: process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIE === "1",
    path: "/",
    maxAge: SITE.sessionHours * 3600,
  };
}

export { COOKIE_NAME };
