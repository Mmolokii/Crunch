/**
 * Encrypts the student's Brightspace calendar feed URL at rest.
 *
 * AES-256-GCM, random IV per save, stored as `iv:tag:ciphertext` (each part
 * base64). Key is a 32-byte value, hex-encoded, from ICS_URL_ENCRYPTION_KEY —
 * server-side only, never sent to the client.
 *
 * Anything that doesn't decrypt with the current key comes back as "", which
 * the feed allow-list rejects, so the sync reports invalid_url. There used to
 * be a fallback that returned unencrypted values as-is for rows saved before
 * encryption existed; production has none left, so it was removed (CRU-35)
 * rather than leave a path for a plaintext URL to be trusted.
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
  if (parts.length !== 3) return "";

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
    // Wrong key, tampered data, or not our ciphertext at all.
    return "";
  }
}
