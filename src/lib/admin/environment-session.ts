import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "autmail-admin-session";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

function signingKey() {
  const email = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_LOGIN_PASSWORD;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!email || !password || password.length > 256 || !secret || !origin) return null;
  // Domain-separated server key: a short login password cannot forge a session.
  // Rotating the password, email, origin, or server key invalidates all sessions.
  return createHmac("sha256", secret).update(JSON.stringify(["autmail-admin-session-v1", email, password, origin])).digest();
}

export function verifyEnvironmentAdminPassword(password: string) {
  if (!signingKey()) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(password), hash(process.env.ADMIN_LOGIN_PASSWORD!));
}

export function createEnvironmentAdminSession(now = Date.now()) {
  const key = signingKey();
  if (!key) throw new Error("Administrator environment credentials are incomplete.");
  const payload = Buffer.from(JSON.stringify({ v: 1, issued: now, expires: now + ADMIN_SESSION_SECONDS * 1000, nonce: randomBytes(32).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function validEnvironmentAdminSession(token: string | undefined, now = Date.now()) {
  const key = signingKey();
  if (!key || !token || token.length > 1024) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
  const expected = createHmac("sha256", key).update(parts[0]).digest("base64url");
  if (!timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.v === 1 && Number.isSafeInteger(payload.issued) && Number.isSafeInteger(payload.expires)
      && payload.issued <= now && payload.expires > now
      && payload.expires - payload.issued === ADMIN_SESSION_SECONDS * 1000
      && typeof payload.nonce === "string" && /^[a-f0-9]{64}$/.test(payload.nonce);
  } catch { return false; }
}
