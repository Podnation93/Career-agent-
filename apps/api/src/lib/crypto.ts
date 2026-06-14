import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/** Hash a session token for storage (we never store the raw token). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a cryptographically random opaque session token. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface EncryptedBlob {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/** AES-256-GCM encrypt a secret (e.g. OAuth token) using a 32-byte key. */
export function encryptSecret(plaintext: string, keyBase64: string): EncryptedBlob {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

/** AES-256-GCM decrypt. */
export function decryptSecret(blob: EncryptedBlob, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, blob.iv);
  decipher.setAuthTag(blob.tag);
  return Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]).toString("utf8");
}
