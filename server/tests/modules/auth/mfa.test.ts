// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  buildOtpAuthUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "@/modules/auth/mfa.js";

describe("MFA primitives", () => {
  describe("encryptSecret / decryptSecret", () => {
    it("roundtrips a base32 secret", () => {
      const secret = generateTotpSecret();
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted.ok).toBe(true);
      if (decrypted.ok) {
        expect(decrypted.value).toBe(secret);
      }
    });

    it("produces a different ciphertext each time (random IV)", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const a = encryptSecret(secret);
      const b = encryptSecret(secret);
      expect(a).not.toBe(b);
    });

    it("fails to decrypt a tampered payload", () => {
      const secret = generateTotpSecret();
      const encrypted = encryptSecret(secret);
      // Flip a byte in the ciphertext segment.
      const parts = encrypted.split(":");
      const tamperedHex = parts[2]!.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
      const tampered = `${parts[0]}:${parts[1]}:${tamperedHex}`;
      const result = decryptSecret(tampered);
      expect(result.ok).toBe(false);
    });

    it("rejects a malformed payload", () => {
      const result = decryptSecret("not-a-valid-payload");
      expect(result.ok).toBe(false);
    });
  });

  describe("verifyTotp", () => {
    it("accepts a code generated right now", () => {
      const secret = generateTotpSecret();
      const totp = new OTPAuth.TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();
      expect(verifyTotp(secret, code)).toBe(true);
    });

    it("rejects a code that is clearly wrong", () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, "000000")).toBe(false);
    });

    it("rejects non-6-digit input", () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, "12345")).toBe(false);
      expect(verifyTotp(secret, "abcdef")).toBe(false);
      expect(verifyTotp(secret, "1234567")).toBe(false);
    });
  });

  describe("buildOtpAuthUri", () => {
    it("returns a valid otpauth:// URI with the given account", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const uri = buildOtpAuthUri({ secret, accountName: "test@example.com" });
      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
      expect(uri).toContain("test%40example.com");
    });
  });

  describe("recovery codes", () => {
    it("generates 10 plaintext + matching hashed codes", () => {
      const { plaintext, hashed } = generateRecoveryCodes();
      expect(plaintext).toHaveLength(10);
      expect(hashed).toHaveLength(10);
      plaintext.forEach((code, i) => {
        expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
        expect(hashRecoveryCode(code)).toBe(hashed[i]);
      });
    });

    it("each code is unique", () => {
      const { plaintext } = generateRecoveryCodes();
      expect(new Set(plaintext).size).toBe(plaintext.length);
    });

    it("normalizes hyphens and whitespace before hashing", () => {
      const code = "abcde-12345";
      expect(hashRecoveryCode(code)).toBe(hashRecoveryCode("ABCDE-12345"));
      expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(" abcde12345 "));
      expect(normalizeRecoveryCode("ABCDE-12345")).toBe("abcde12345");
    });
  });
});
