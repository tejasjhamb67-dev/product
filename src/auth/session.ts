import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal signed session token: base64url(payload).base64url(hmac-sha256)
// Payload: { uid, exp } — no PII beyond the user id.

export interface SessionPayload {
  uid: number;
  exp: number; // unix seconds
}

function sign(data: string, key: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

export function createSessionToken(uid: number, key: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const payload: SessionPayload = { uid, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function verifySessionToken(token: string, key: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = sign(body, key);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
