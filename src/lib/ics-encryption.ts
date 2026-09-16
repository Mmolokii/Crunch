/**
 * Encrypts the student's Brightspace calendar feed URL at rest.
 *
 * AES-256-GCM, random IV per save, stored as `iv:tag:ciphertext` (each part
 * base64). Key is a 32-byte value, hex-encoded, from ICS_URL_ENCRYPTION_KEY —
 * server-side only, never sent to the client.
 *
 * Rows saved before this existed are still plaintext URLs. decryptIcsUrl
 * returns anything that doesn't match the iv:tag:ciphertext shape unchanged,
 * so old rows keep working rather than breaking on the next read.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const hex = process.env["ICS_URL_ENCRYPTION_KEY"];
  if (!hex) {
    throw new Error("Missing ICS_URL_ENCRYPTION_KEY environment variable.");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ICS_URL_ENCRYPTION_KEY must be a ${KEY_LENGTH}-byte value, hex-encoded (${KEY_LENGTH * 2} hex characters).`,
    );
  }
  return key;
}

export function encryptIcsUrl(plainUrl: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainUrl, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptIcsUrl(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) return stored; // legacy plaintext row

  const [ivB64, tagB64, dataB64] = parts;
  try {
    const key = getKey();
    const iv = Buffer.from(ivB64!, "base64");
    const tag = Buffer.from(tagB64!, "base64");
    const data = Buffer.from(dataB64!, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // Didn't actually match our ciphertext shape (e.g. a plaintext URL that
    // happens to split into three colon-separated parts) — return as stored.
    return stored;
  }
}
