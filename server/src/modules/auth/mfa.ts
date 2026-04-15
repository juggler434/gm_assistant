// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TOTP (RFC 6238) + recovery-code primitives.
 *
 * Secrets are encrypted at rest with AES-256-GCM using `config.mfa.encryptionKey`.
 * Recovery codes are stored as SHA-256 hex hashes; the plaintext codes are
 * shown to the user exactly once at enable time.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
import { config } from "@/config/index.js";
import { ok, err, type Result } from "@/types/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 5; // 10 hex chars → ~40 bits entropy per code
const TOTP_WINDOW = 1; // accept the previous and next 30-second steps
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;

export type MfaError =
  | { code: "INVALID_ENCRYPTION_KEY" }
  | { code: "DECRYPT_FAILED" };

function getEncryptionKey(): Buffer {
  const hex = config.mfa.encryptionKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("MFA encryption key must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt a base32 TOTP secret as `iv:authTag:ciphertext` (all hex). */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Decrypt a secret produced by {@link encryptSecret}. */
export function decryptSecret(payload: string): Result<string, MfaError> {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    return err({ code: "DECRYPT_FAILED" });
  }
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string];
  try {
    const key = getEncryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final(),
    ]);
    return ok(plaintext.toString("utf8"));
  } catch {
    return err({ code: "DECRYPT_FAILED" });
  }
}

/** Generate a fresh base32 TOTP secret. */
export function generateTotpSecret(): string {
  // 20 bytes (160 bits) is the RFC 4226 recommendation and widely compatible.
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** Build the otpauth:// URI clients use to render a QR code. */
export function buildOtpAuthUri(params: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const totp = new OTPAuth.TOTP({
    issuer: params.issuer ?? config.mfa.issuer,
    label: params.accountName,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(params.secret),
  });
  return totp.toString();
}

/** Verify a 6-digit TOTP code against a base32 secret. Accepts ±1 step drift. */
export function verifyTotp(secret: string, code: string): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: normalized, window: TOTP_WINDOW });
  return delta !== null;
}

/** Hash a recovery code (high-entropy token) with SHA-256 for constant-lookup storage. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Strip formatting (hyphens, whitespace) and lowercase. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[-\s]/g, "").toLowerCase();
}

/** Generate N single-use recovery codes formatted as `xxxxx-xxxxx`. */
export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT
): { plaintext: string[]; hashed: string[] } {
  const plaintext: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(RECOVERY_CODE_BYTES).toString("hex"); // 10 chars
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    plaintext.push(formatted);
    hashed.push(hashRecoveryCode(formatted));
  }
  return { plaintext, hashed };
}

export const MFA_CONSTANTS = {
  RECOVERY_CODE_COUNT,
  TOTP_WINDOW,
  TOTP_PERIOD,
  TOTP_DIGITS,
};
