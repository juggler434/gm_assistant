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
