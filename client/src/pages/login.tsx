// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api-client";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  email_not_verified: "Your Google account email is not verified.",
  account_not_linkable:
    "An account with this email already exists. Please sign in with your password first, then link Google from your account settings.",
  invalid_state: "Your sign-in attempt expired. Please try again.",
  token_exchange_failed: "We couldn't complete Google sign-in. Please try again.",
  session_failed: "We couldn't start your session. Please try again.",
  link_failed: "We couldn't link your Google account. Please try again.",
  create_failed: "We couldn't create your account. Please try again.",
  invalid_request: "Invalid Google sign-in request.",
  unknown_error: "Something went wrong with Google sign-in.",
};

export function LoginPage() {
  const { login, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const oauthErrorCode = searchParams.get("oauth_error");
  const oauthError = oauthErrorCode
    ? (OAUTH_ERROR_MESSAGES[oauthErrorCode] ?? OAUTH_ERROR_MESSAGES.unknown_error)
    : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaReturnTo, setMfaReturnTo] = useState<string | null>(null);

  // Pick up an mfa_token from the URL (e.g. after Google OAuth callback
  // redirected here because MFA is enabled on the account).
  useEffect(() => {
    const urlMfaToken = searchParams.get("mfa_token");
    if (urlMfaToken) {
      setMfaToken(urlMfaToken);
      const returnTo = searchParams.get("return_to");
      if (returnTo) setMfaReturnTo(returnTo);
    }
  }, [searchParams]);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      if (result.kind === "mfa_required") {
        setMfaToken(result.mfaToken);
        setPassword("");
        return;
      }
      navigate(result.user.emailVerified ? "/campaigns" : "/verify-email");
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        setError("Invalid email or password.");
      } else if (err instanceof ApiError && err.statusCode === 429) {
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = mfaCode.trim();
    if (!trimmed) {
      setError("Enter your 6-digit code or a recovery code.");
      return;
    }
    if (!mfaToken) return;

    setIsSubmitting(true);
    try {
      const user = await completeMfaLogin(mfaToken, trimmed);
      const fallback = user.emailVerified ? "/campaigns" : "/verify-email";
      navigate(mfaReturnTo ?? fallback);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        // The pending token is consumed on any attempt by some code paths,
        // so we leave it in place and let the user retry with a fresh code.
        // If the server says expired, it will return 401 again and the user
        // can re-enter their password.
        setError(err.message || "Invalid or expired code.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelMfa() {
    setMfaToken(null);
    setMfaCode("");
    setMfaReturnTo(null);
    setError(null);
  }

  if (mfaToken) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app, or use a recovery code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMfaSubmit} className="space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mfa-code">Verification code</Label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Lost access to your app? Enter a recovery code instead.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Spinner label="Verifying" /> : "Verify"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={cancelMfa}
              disabled={isSubmitting}
            >
              Back to sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome Back</CardTitle>
        <CardDescription>Sign in to your GM Assistant account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {resetSuccess && (
            <div
              role="status"
              className="rounded-md border border-success/50 bg-success/10 px-3 py-2 text-sm text-success"
            >
              Your password has been reset. Please sign in with your new password.
            </div>
          )}

          {(error || oauthError) && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error ?? oauthError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="gamemaster@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: "" }));
              }}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: "" }));
              }}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot your password?
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner label="Signing in" /> : "Sign In"}
          </Button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-border" />
            <span className="mx-3 text-xs uppercase tracking-wider text-muted-foreground">or</span>
            <div className="flex-grow border-t border-border" />
          </div>

          <GoogleSignInButton label="Sign in with Google" disabled={isSubmitting} />

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
