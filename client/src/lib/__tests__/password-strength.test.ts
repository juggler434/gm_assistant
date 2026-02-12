import { describe, it, expect } from "vitest";
import { getPasswordStrength } from "../password-strength";

describe("getPasswordStrength", () => {
  describe("weak passwords", () => {
    it("returns weak for empty string", () => {
      expect(getPasswordStrength("")).toBe("weak");
    });

    it("returns weak for passwords shorter than 8 characters", () => {
      expect(getPasswordStrength("abc")).toBe("weak");
      expect(getPasswordStrength("1234567")).toBe("weak");
    });

    it("returns weak for 8+ char password with no variety", () => {
      expect(getPasswordStrength("abcdefgh")).toBe("weak");
    });
  });

  describe("fair passwords", () => {
    it("returns fair for 8+ chars with digits", () => {
      expect(getPasswordStrength("abcdefg1")).toBe("fair");
    });

    it("returns fair for 8+ chars with mixed case", () => {
      expect(getPasswordStrength("abcdEfgh")).toBe("fair");
    });

    it("returns fair for 8+ chars with special characters", () => {
      expect(getPasswordStrength("abcdefg!")).toBe("fair");
    });

    it("returns fair for 12+ chars with no other variety", () => {
      expect(getPasswordStrength("abcdefghijkl")).toBe("fair");
    });
  });

  describe("strong passwords", () => {
    it("returns strong for 12+ chars with mixed case and digits", () => {
      expect(getPasswordStrength("abcdEfghijk1")).toBe("strong");
    });

    it("returns strong for 8+ chars with mixed case, digits, and special", () => {
      expect(getPasswordStrength("Abcdef1!")).toBe("strong");
    });

    it("returns strong for a complex password", () => {
      expect(getPasswordStrength("MyP@ssw0rd!123")).toBe("strong");
    });
  });
});
