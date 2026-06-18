import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashToken, newSessionToken } from "../crypto.js";

describe("crypto", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips AES-256-GCM", () => {
    const blob = encryptSecret("super-secret-oauth-token", key);
    expect(decryptSecret(blob, key)).toBe("super-secret-oauth-token");
  });

  it("fails to decrypt with a tampered tag", () => {
    const blob = encryptSecret("x", key);
    blob.tag[0] = (blob.tag[0] ?? 0) ^ 0xff;
    expect(() => decryptSecret(blob, key)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow();
  });

  it("hashes session tokens deterministically and uniquely", () => {
    const t = newSessionToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(hashToken(newSessionToken()));
  });
});
