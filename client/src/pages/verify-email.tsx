// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { api, ApiError } from "@/lib/api-client";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  if (token) {
    return <ConsumeToken token={token} />;
  }

  return <CheckYourEmail />;
}

/** Screen shown when user needs to verify — with resend button. */
function CheckYourEmail() {
  const { user, isAuthenticated, isEmailVerified, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refresh user state on mount in case they verified in another tab
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // If already verified, redirect to campaigns
  useEffect(() => {
    if (isEmailVerified) {
      navigate("/campaigns", { replace: true });
    }
  }, [isEmailVerified, navigate]);

  // If not authenticated, redirect to login
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  async function handleResend() {
    setResendState("sending");
    setErrorMessage(null);
    try {
      await api.post("/api/auth/resend-verification", {});
      setResendState("sent");
    } catch (err) {
      setResendState("error");
      if (err instanceof ApiError && err.statusCode === 429) {
        setErrorMessage("Too many requests. Please wait a few minutes before trying again.");
      } else if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to resend verification email.");
      }
    }
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Check Your Email</CardTitle>
            <CardDescription>
              We sent a verification link to{" "}
              <span className="font-medium text-foreground">{user.email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Click the link in the email to verify your account. You need to verify your email
              before you can use GM Assistant.
            </p>

            {resendState === "sent" && (
              <div
                role="status"
                className="rounded-md border border-success/50 bg-success/10 px-3 py-2 text-center text-sm text-success"
              >
                Verification email sent! Check your inbox.
              </div>
            )}

            {resendState === "error" && errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
              >
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleResend}
                disabled={resendState === "sending" || resendState === "sent"}
                className="w-full"
              >
                {resendState === "sending" ? (
                  <Spinner label="Sending" />
                ) : resendState === "sent" ? (
                  "Email Sent"
                ) : (
                  "Resend Verification Email"
                )}
              </Button>
              <Button variant="ghost" className="w-full" onClick={logout}>
                Sign out
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Didn't receive the email? Check your spam folder or try resending.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Screen shown when user clicks the verification link from their email. */
function ConsumeToken({ token }: { token: string }) {
  const { refreshUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const verify = useCallback(async () => {
    try {
      await api.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
      setStatus("success");
      // Refresh user data so isEmailVerified updates
      await refreshUser();
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Verification failed. The link may be expired or invalid.");
      }
    }
  }, [token, refreshUser]);

  // Guard against StrictMode double-invocation consuming the single-use token twice
  const hasStarted = useRef(false);
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    verify();
  }, [verify]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            {status === "verifying" && (
              <>
                <div className="mx-auto mb-2">
                  <Spinner className="h-8 w-8" label="Verifying your email" />
                </div>
                <CardTitle className="text-2xl">Verifying Email</CardTitle>
                <CardDescription>Please wait while we verify your email address...</CardDescription>
              </>
            )}

            {status === "success" && (
              <>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                  <CheckCircle className="h-6 w-6 text-success" />
                </div>
                <CardTitle className="text-2xl">Email Verified</CardTitle>
                <CardDescription>
                  Your email has been verified. You can now use GM Assistant.
                </CardDescription>
              </>
            )}

            {status === "error" && (
              <>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <CardTitle className="text-2xl">Verification Failed</CardTitle>
                <CardDescription>
                  {errorMessage || "The verification link is invalid or has expired."}
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {status === "success" && (
              <Button className="w-full" onClick={() => navigate("/campaigns", { replace: true })}>
                Go to Campaigns
              </Button>
            )}

            {status === "error" && (
              <div className="flex flex-col gap-2">
                {isAuthenticated ? (
                  <Button
                    className="w-full"
                    onClick={() => navigate("/verify-email", { replace: true })}
                  >
                    Request New Link
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
                    Go to Login
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
