// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api-client";
import { getPasswordStrength, type PasswordStrength } from "@/lib/password-strength";

const strengthConfig: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  weak: { label: "Weak", color: "bg-destructive", width: "w-1/3" },
  fair: { label: "Fair", color: "bg-warning", width: "w-2/3" },
  strong: { label: "Strong", color: "bg-success", width: "w-full" },
};

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
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
      await api.post("/api/auth/reset-password", { token, password });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        setError("This reset link is invalid or has expired. Please request a new one.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Invalid Link</CardTitle>
          <CardDescription>
            This password reset link is missing a token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request New Link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isSuccess) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Password Reset</CardTitle>
          <CardDescription>
            Your password has been reset successfully. You can now sign in with
            your new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => navigate("/login?reset=success")}>
            Go to Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  const strength = password ? getPasswordStrength(password) : null;
  const cfg = strength ? strengthConfig[strength] : null;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Reset Password</CardTitle>
        <CardDescription>Choose a new password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
              {error.includes("expired") && (
                <p className="mt-2">
                  <Link to="/forgot-password" className="text-primary hover:underline">
                    Request a new link
                  </Link>
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: "" }));
              }}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : "password-strength"}
            />
            {fieldErrors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            )}
            {password && cfg && !fieldErrors.password && (
              <div id="password-strength" className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-secondary">
                  <div className={`h-full rounded-full transition-all ${cfg.color} ${cfg.width}`} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Password strength: <span className="font-medium">{cfg.label}</span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
              }}
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={fieldErrors.confirmPassword ? "confirm-error" : undefined}
            />
            {fieldErrors.confirmPassword && (
              <p id="confirm-error" className="text-xs text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner label="Resetting password" /> : "Reset Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
