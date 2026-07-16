import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

// One-click brief feedback from email: links carry an HMAC so they work
// without a login session (email clients don't share cookies). Feeds the
// Day-7 retention / engagement metrics in PRD §9.

export function feedbackSignature(briefId: number, userId: number, score: "up" | "down"): string {
  return createHmac("sha256", config().SESSION_SIGNING_KEY)
    .update(`feedback:${briefId}:${userId}:${score}`)
    .digest("base64url");
}

export function verifyFeedbackSignature(
  briefId: number,
  userId: number,
  score: "up" | "down",
  signature: string,
): boolean {
  const expected = feedbackSignature(briefId, userId, score);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function feedbackUrl(briefId: number, userId: number, score: "up" | "down"): string {
  const sig = feedbackSignature(briefId, userId, score);
  return `${config().APP_BASE_URL}/feedback?brief=${briefId}&user=${userId}&score=${score}&sig=${sig}`;
}
