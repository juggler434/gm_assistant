// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Copy, Check, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MfaEnableResponse, MfaSetupResponse } from "@/types";

type EnrollStep = "idle" | "show_qr" | "show_recovery";

export function AccountSecurityPage() {
  const { user, refreshUser } = useAuth();
  const mfaEnabled = !!user?.mfaEnabled;

  const [step, setStep] = useState<EnrollStep>("idle");
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [secretCopied, setSecretCopied] = useState(false);

  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  async function startEnroll() {
    setEnrollError(null);
    setIsEnrolling(true);
    try {
      const data = await api.post<MfaSetupResponse>("/api/auth/mfa/setup");
      setSetupData(data);
      setStep("show_qr");
    } catch (err) {
      if (err instanceof ApiError) {
        setEnrollError(err.message);
      } else {
        setEnrollError("Failed to start MFA enrollment.");
      }
    } finally {
      setIsEnrolling(false);
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    setEnrollError(null);

    const trimmed = confirmCode.trim().replace(/\s+/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setEnrollError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setIsConfirming(true);
    try {
      const data = await api.post<MfaEnableResponse>("/api/auth/mfa/enable", {
        code: trimmed,
      });
      setRecoveryCodes(data.recoveryCodes);
      setStep("show_recovery");
      setConfirmCode("");
      await refreshUser();
    } catch (err) {
      if (err instanceof ApiError) {
        setEnrollError(err.message);
      } else {
        setEnrollError("Failed to confirm code.");
      }
    } finally {
      setIsConfirming(false);
    }
  }

  function finishEnroll() {
    setStep("idle");
    setSetupData(null);
    setRecoveryCodes([]);
    setSecretCopied(false);
    toast.success("Two-factor authentication enabled");
  }

  async function copySecret() {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  function downloadRecoveryCodes() {
    const text = [
      "GM Assistant — Recovery Codes",
      `Account: ${user?.email ?? ""}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "Each code can be used once to sign in if you lose access to your",
      "authenticator app. Store them somewhere safe.",
      "",
      ...recoveryCodes,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gm-assistant-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function submitDisable(e: FormEvent) {
    e.preventDefault();
    setDisableError(null);

    if (!disablePassword) {
      setDisableError("Enter your current password.");
      return;
    }
    const trimmed = disableCode.trim();
    if (!trimmed) {
      setDisableError("Enter a 6-digit code or a recovery code.");
      return;
    }

    setIsDisabling(true);
    try {
      await api.post("/api/auth/mfa/disable", {
        password: disablePassword,
        code: trimmed,
      });
      toast.success("Two-factor authentication disabled");
      setDisableOpen(false);
      setDisablePassword("");
      setDisableCode("");
      await refreshUser();
    } catch (err) {
      if (err instanceof ApiError) {
        setDisableError(err.message);
      } else {
        setDisableError("Failed to disable MFA.");
      }
    } finally {
      setIsDisabling(false);
    }
  }

  function cancelEnroll() {
    setStep("idle");
    setSetupData(null);
    setConfirmCode("");
    setEnrollError(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Account Security</h1>
        <p className="text-sm text-muted-foreground">Manage your authentication settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {mfaEnabled ? (
              <ShieldCheck className="h-5 w-5 text-success" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            )}
            Two-Factor Authentication
            {mfaEnabled && <Badge variant="success">Enabled</Badge>}
          </CardTitle>
          <CardDescription>
            Add an authenticator app (e.g. 1Password, Authy, Google Authenticator) for an extra
            layer of security on your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "idle" && !mfaEnabled && (
            <div className="space-y-4">
              {enrollError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {enrollError}
                </div>
              )}
              <Button onClick={startEnroll} disabled={isEnrolling}>
                {isEnrolling ? <Spinner label="Starting" /> : "Enable Two-Factor Auth"}
              </Button>
            </div>
          )}

          {step === "idle" && mfaEnabled && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Two-factor authentication is active. You&apos;ll be asked for a verification code
                after entering your password.
              </p>
              <Button variant="destructive" onClick={() => setDisableOpen(true)}>
                Disable Two-Factor Auth
              </Button>
            </div>
          )}

          {step === "show_qr" && setupData && (
            <form onSubmit={confirmEnroll} className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">1. Scan this QR code</p>
                <div className="flex justify-center rounded-md border border-border bg-white p-4">
                  <QRCodeSVG value={setupData.otpauthUri} size={200} level="M" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Or enter the secret manually</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-md bg-secondary px-3 py-2 font-mono text-xs">
                    {setupData.secret}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copySecret}
                    aria-label="Copy secret"
                  >
                    {secretCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-code">2. Enter the 6-digit code from your app</Label>
                <Input
                  id="confirm-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  autoFocus
                />
              </div>

              {enrollError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {enrollError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={cancelEnroll}
                  disabled={isConfirming}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isConfirming}>
                  {isConfirming ? <Spinner label="Verifying" /> : "Verify & Enable"}
                </Button>
              </div>
            </form>
          )}

          {step === "show_recovery" && (
            <div className="space-y-4">
              <div
                role="alert"
                className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning"
              >
                Save these recovery codes somewhere safe. They will not be shown again. Each code
                works once if you lose access to your authenticator app.
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-secondary p-4 font-mono text-sm">
                {recoveryCodes.map((code) => (
                  <div key={code} className="select-all">
                    {code}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={downloadRecoveryCodes}>
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button type="button" onClick={finishEnroll}>
                  I&apos;ve saved them
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Confirm your password and enter a current code to remove 2FA from your account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitDisable} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="disable-password">Current password</Label>
              <Input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disable-code">Verification code or recovery code</Label>
              <Input
                id="disable-code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
              />
            </div>

            {disableError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {disableError}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDisableOpen(false)}
                disabled={isDisabling}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isDisabling}>
                {isDisabling ? <Spinner label="Disabling" /> : "Disable"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
