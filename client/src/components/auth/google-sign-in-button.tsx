// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface GoogleSignInButtonProps {
  label?: string;
  disabled?: boolean;
}

/**
 * Renders a "Sign in with Google" button that does a full-page redirect to
 * /api/auth/google/start. Hides itself when the server reports that Google
 * OAuth is not configured.
 */
export function GoogleSignInButton({
  label = "Continue with Google",
  disabled,
}: GoogleSignInButtonProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/google/config", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        if (!cancelled) setEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={disabled}
      onClick={() => {
        window.location.href = "/api/auth/google/start";
      }}
    >
      <GoogleIcon />
      {label}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
    >
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.25 1.4-1.75 4.1-5.5 4.1-3.3 0-6-2.75-6-6.1s2.7-6.1 6-6.1c1.9 0 3.15.8 3.9 1.5l2.65-2.55C16.9 3.4 14.7 2.5 12 2.5 6.75 2.5 2.5 6.75 2.5 12s4.25 9.5 9.5 9.5c5.5 0 9.15-3.85 9.15-9.3 0-.6-.05-1.1-.15-1.5H12z"
      />
    </svg>
  );
}
