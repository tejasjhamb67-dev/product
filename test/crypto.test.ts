import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "../src/crypto/tokens.js";
import { createSessionToken, verifySessionToken } from "../src/auth/session.js";
import { checkCompliance } from "../src/brief/compliance.js";

const KEY = "a".repeat(64); // 32 bytes hex

describe("token encryption", () => {
  it("round-trips", () => {
    const ct = encryptToken("kite-access-token-xyz", KEY);
    expect(decryptToken(ct, KEY)).toBe("kite-access-token-xyz");
  });
  it("produces distinct ciphertexts (random IV)", () => {
    expect(encryptToken("x", KEY)).not.toBe(encryptToken("x", KEY));
  });
  it("fails on tampering", () => {
    const ct = encryptToken("secret", KEY);
    const parts = ct.split(".");
    const tampered = [parts[0], parts[1], Buffer.from("evil").toString("base64")].join(".");
    expect(() => decryptToken(tampered, KEY)).toThrow();
  });
});

describe("session tokens", () => {
  const SIGNING = "s".repeat(64);
  it("round-trips", () => {
    const token = createSessionToken(42, SIGNING);
    expect(verifySessionToken(token, SIGNING)?.uid).toBe(42);
  });
  it("rejects wrong key", () => {
    const token = createSessionToken(42, SIGNING);
    expect(verifySessionToken(token, "x".repeat(64))).toBeNull();
  });
  it("rejects expired", () => {
    const token = createSessionToken(42, SIGNING, -10);
    expect(verifySessionToken(token, SIGNING)).toBeNull();
  });
});

describe("compliance guard", () => {
  it("passes descriptive language", () => {
    expect(
      checkCompliance(
        "Your BFSI weight is 34% against the 30% threshold you set, driven mainly by two names.",
      ).ok,
    ).toBe(true);
  });
  it("catches prescriptive directives", () => {
    expect(checkCompliance("You should trim your bank holdings.").ok).toBe(false);
    expect(checkCompliance("Consider reducing exposure to HDFCBANK.").ok).toBe(false);
    expect(checkCompliance("We recommend rotating into IT.").ok).toBe(false);
    expect(checkCompliance("Sell HDFCBANK before expiry.").ok).toBe(false);
    expect(checkCompliance("A target price of 2600 looks likely.").ok).toBe(false);
  });
});

describe("feedback link signing", () => {
  it("verifies its own signatures and rejects tampering", async () => {
    process.env.DATABASE_URL ??= "postgres://x:x@localhost:5432/x";
    process.env.TOKEN_ENCRYPTION_KEY ??= "a".repeat(64);
    process.env.SESSION_SIGNING_KEY ??= "s".repeat(64);
    process.env.ANTHROPIC_API_KEY ??= "test";
    process.env.KITE_API_KEY ??= "test";
    process.env.KITE_API_SECRET ??= "test";
    process.env.RESEND_API_KEY ??= "test";
    process.env.EMAIL_FROM ??= "test@test.in";
    const { feedbackSignature, verifyFeedbackSignature } = await import(
      "../src/delivery/feedback.js"
    );
    const sig = feedbackSignature(12, 34, "up");
    expect(verifyFeedbackSignature(12, 34, "up", sig)).toBe(true);
    expect(verifyFeedbackSignature(12, 34, "down", sig)).toBe(false); // score swap
    expect(verifyFeedbackSignature(12, 35, "up", sig)).toBe(false); // user swap
  });
});
