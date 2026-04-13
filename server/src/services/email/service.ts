// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Email Service
 *
 * Thin wrapper around an EmailProvider that adds high-level helpers for
 * the messages this app actually sends (currently: email verification).
 */

import type { Result } from "@/types/index.js";
import { EmailError, type SendEmailRequest, type SendEmailResponse } from "./types.js";
import type { EmailProvider } from "./providers/interface.js";

export interface EmailServiceLogger {
  debug?: (message: string, data?: Record<string, unknown>) => void;
  info?: (message: string, data?: Record<string, unknown>) => void;
  warn?: (message: string, data?: Record<string, unknown>) => void;
  error?: (message: string, data?: Record<string, unknown>) => void;
}

export interface EmailServiceOptions {
  logger?: EmailServiceLogger;
}

export interface PasswordResetEmailContext {
  /** Recipient address. */
  to: string;
  /** Display name for greeting. */
  recipientName: string;
  /** Fully-qualified reset URL containing the token. */
  resetUrl: string;
  /** When the link will expire (used in copy). */
  expiresAt: Date;
}

export interface VerificationEmailContext {
  /** Recipient address. */
  to: string;
  /** Display name for greeting. */
  recipientName: string;
  /** Fully-qualified verification URL containing the token. */
  verificationUrl: string;
  /** When the link will expire (used in copy). */
  expiresAt: Date;
}

export class EmailService {
  private readonly provider: EmailProvider;
  private readonly logger: EmailServiceLogger | undefined;

  constructor(provider: EmailProvider, options?: EmailServiceOptions) {
    this.provider = provider;
    this.logger = options?.logger;
  }

  get providerName(): string {
    return this.provider.name;
  }

  /** Low-level send. Most callers should use a typed helper instead. */
  async send(
    request: SendEmailRequest
  ): Promise<Result<SendEmailResponse, EmailError>> {
    this.logger?.debug?.("Sending email", { to: request.to, subject: request.subject });
    const result = await this.provider.send(request);
    if (result.ok) {
      this.logger?.info?.("Email sent", {
        to: request.to,
        subject: request.subject,
        provider: this.provider.name,
        messageId: result.value.messageId,
      });
    } else {
      this.logger?.error?.("Email send failed", {
        to: request.to,
        subject: request.subject,
        code: result.error.code,
        message: result.error.message,
      });
    }
    return result;
  }

  /** Send the password-reset message. */
  async sendPasswordResetEmail(
    context: PasswordResetEmailContext
  ): Promise<Result<SendEmailResponse, EmailError>> {
    const hours = Math.max(1, Math.round((context.expiresAt.getTime() - Date.now()) / 3_600_000));
    const subject = "Reset your password — The Grimoire";
    const text = [
      `Hi ${context.recipientName},`,
      "",
      "We received a request to reset your password. Use the link below to choose a new one:",
      "",
      context.resetUrl,
      "",
      `This link will expire in about ${hours} hour${hours === 1 ? "" : "s"}.`,
      "",
      "If you didn't request a password reset, you can safely ignore this email. Your password won't change.",
      "",
      "— The Grimoire",
    ].join("\n");
    const html = buildPasswordResetHtml(context, hours);

    return this.send({
      to: context.to,
      subject,
      text,
      html,
    });
  }

  /** Notify an existing user that someone tried to register with their email. */
  async sendDuplicateRegistrationEmail(
    context: { to: string; recipientName: string }
  ): Promise<Result<SendEmailResponse, EmailError>> {
    const subject = "Someone tried to create an account with your email — The Grimoire";
    const text = [
      `Hi ${context.recipientName},`,
      "",
      "Someone just tried to create a new account using your email address. If this was you, you can log in to your existing account instead.",
      "",
      "If you didn't try to register, no action is needed — your account is safe.",
      "",
      "— The Grimoire",
    ].join("\n");
    const html = buildDuplicateRegistrationHtml(context.recipientName);

    return this.send({ to: context.to, subject, text, html });
  }

  /** Send the email-verification message. */
  async sendVerificationEmail(
    context: VerificationEmailContext
  ): Promise<Result<SendEmailResponse, EmailError>> {
    const hours = Math.max(1, Math.round((context.expiresAt.getTime() - Date.now()) / 3_600_000));
    const subject = "Verify your email — The Grimoire";
    const text = [
      `Hi ${context.recipientName},`,
      "",
      "Welcome to The Grimoire! Please confirm your email address by visiting the link below:",
      "",
      context.verificationUrl,
      "",
      `This link will expire in about ${hours} hour${hours === 1 ? "" : "s"}.`,
      "",
      "If you didn't create an account, you can safely ignore this message.",
      "",
      "— The Grimoire",
    ].join("\n");
    const html = buildVerificationHtml(context, hours);

    return this.send({
      to: context.to,
      subject,
      text,
      html,
    });
  }
}

function buildPasswordResetHtml(context: PasswordResetEmailContext, hours: number): string {
  const url = escapeAttribute(context.resetUrl);
  const name = escapeHtml(context.recipientName);
  const expiry = `${hours} hour${hours === 1 ? "" : "s"}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0f0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f14;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <!-- Header -->
        <tr><td style="text-align:center;padding-bottom:32px;">
          <span style="font-size:28px;">&#128214;</span>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:700;color:#e8e6e3;letter-spacing:-0.5px;">The Grimoire</h1>
        </td></tr>
        <!-- Card -->
        <tr><td style="background-color:#1e1e28;border:1px solid #3a3a4a;border-radius:12px;padding:32px 28px;">
          <p style="margin:0 0 8px;font-size:16px;color:#e8e6e3;">Hi ${name},</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#9d9baf;">
            We received a request to reset your password. Click the button below to choose a new one.
          </p>
          <!-- CTA Button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:24px;">
              <a href="${url}" style="display:inline-block;padding:12px 32px;background-color:#a855f7;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Reset Password</a>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#9d9baf;">
            Or copy this link into your browser:<br>
            <a href="${url}" style="color:#a855f7;word-break:break-all;">${escapeHtml(context.resetUrl)}</a>
          </p>
          <p style="margin:0;font-size:12px;color:#9d9baf;">
            This link expires in about ${expiry}.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="text-align:center;padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#9d9baf;">
            If you didn't request a password reset, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildVerificationHtml(context: VerificationEmailContext, hours: number): string {
  const url = escapeAttribute(context.verificationUrl);
  const name = escapeHtml(context.recipientName);
  const expiry = `${hours} hour${hours === 1 ? "" : "s"}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0f0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f14;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <!-- Header -->
        <tr><td style="text-align:center;padding-bottom:32px;">
          <span style="font-size:28px;">&#128214;</span>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:700;color:#e8e6e3;letter-spacing:-0.5px;">The Grimoire</h1>
        </td></tr>
        <!-- Card -->
        <tr><td style="background-color:#1e1e28;border:1px solid #3a3a4a;border-radius:12px;padding:32px 28px;">
          <p style="margin:0 0 8px;font-size:16px;color:#e8e6e3;">Hi ${name},</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#9d9baf;">
            Welcome to The Grimoire! Confirm your email address to start managing your campaigns.
          </p>
          <!-- CTA Button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:24px;">
              <a href="${url}" style="display:inline-block;padding:12px 32px;background-color:#a855f7;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Verify Email</a>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#9d9baf;">
            Or copy this link into your browser:<br>
            <a href="${url}" style="color:#a855f7;word-break:break-all;">${escapeHtml(context.verificationUrl)}</a>
          </p>
          <p style="margin:0;font-size:12px;color:#9d9baf;">
            This link expires in about ${expiry}.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="text-align:center;padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#9d9baf;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildDuplicateRegistrationHtml(recipientName: string): string {
  const name = escapeHtml(recipientName);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0f0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f14;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <!-- Header -->
        <tr><td style="text-align:center;padding-bottom:32px;">
          <span style="font-size:28px;">&#128214;</span>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:700;color:#e8e6e3;letter-spacing:-0.5px;">The Grimoire</h1>
        </td></tr>
        <!-- Card -->
        <tr><td style="background-color:#1e1e28;border:1px solid #3a3a4a;border-radius:12px;padding:32px 28px;">
          <p style="margin:0 0 8px;font-size:16px;color:#e8e6e3;">Hi ${name},</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#9d9baf;">
            Someone just tried to create a new account using your email address. If this was you, you can log in to your existing account instead.
          </p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#9d9baf;">
            If you didn't try to register, no action is needed — your account is safe.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="text-align:center;padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#9d9baf;">
            You're receiving this because someone used your email to attempt registration.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
