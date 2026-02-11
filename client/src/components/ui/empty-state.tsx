import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lucide icon or any React node displayed above the heading */
  icon?: React.ReactNode;
  /** Primary heading */
  heading: string;
  /** Supporting description text */
  description?: string;
  /** Optional action element (e.g. a Button) rendered below the description */
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  heading,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-border px-6 py-16 text-center",
        className
      )}
      role="status"
      {...props}
    >
      {icon && <div className="mb-4 text-muted-foreground [&_svg]:h-10 [&_svg]:w-10">{icon}</div>}
      <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
