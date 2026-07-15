import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for broker access tokens at rest (PRD §8: encrypted, short-lived,
// never logged, never sent to the LLM).
// Ciphertext format: base64(iv) . base64(authTag) . base64(ciphertext)

const IV_BYTES = 12;

export function encryptToken(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptToken(encrypted: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const parts = encrypted.split(".");
  if (parts.length !== 3) throw new Error("malformed encrypted token");
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
