// SPDX-License-Identifier: AGPL-3.0-or-later

export type PasswordStrength = "weak" | "fair" | "strong";

export function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return "weak";

  let score = 0;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score >= 3) return "strong";
  if (score >= 1) return "fair";
  return "weak";
}
