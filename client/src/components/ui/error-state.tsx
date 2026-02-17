// SPDX-License-Identifier: AGPL-3.0-or-later

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Primary heading (defaults to "Something went wrong") */
  heading?: string;
  /** Error description or message */
  description?: string;
  /** Retry callback. When provided a "Try again" button is rendered. */
  onRetry?: () => void;
  /** Label for the retry button */
  retryLabel?: string;
  /** Replace the default icon */
  icon?: React.ReactNode;
}

export function ErrorState({
  heading = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  icon,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 px-6 py-16 text-center",
        className
      )}
      role="alert"
      {...props}
    >
      <div className="mb-4 text-destructive [&_svg]:h-10 [&_svg]:w-10">
        {icon ?? <AlertTriangle />}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
