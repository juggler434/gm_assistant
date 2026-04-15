// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(255),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1),
});

export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;

export const resendVerificationBodySchema = z.object({}).optional();

export type ResendVerificationBody = z.infer<typeof resendVerificationBodySchema>;

export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

// MFA / 2FA — accept either a 6-digit TOTP or a formatted 10-hex recovery code.
const totpOrRecoveryCode = z
  .string()
  .min(1)
  .max(32)
  .refine((v) => /^\d{6}$/.test(v.replace(/\s+/g, "")) || /^[0-9a-fA-F-]{10,13}$/.test(v), {
    message: "Must be a 6-digit code or a recovery code",
  });

export const mfaEnableBodySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

export type MfaEnableBody = z.infer<typeof mfaEnableBodySchema>;

export const mfaLoginBodySchema = z.object({
  mfaToken: z.string().min(1),
  code: totpOrRecoveryCode,
});

export type MfaLoginBody = z.infer<typeof mfaLoginBodySchema>;

export const mfaDisableBodySchema = z.object({
  password: z.string().min(1),
  code: totpOrRecoveryCode,
});

export type MfaDisableBody = z.infer<typeof mfaDisableBodySchema>;
