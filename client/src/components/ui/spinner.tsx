import { cn } from "@/lib/utils";

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  /** Accessible label for screen readers */
  label?: string;
}

export function Spinner({ className, label = "Loading", ...props }: SpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 animate-spin text-primary", className)}
      role="status"
      aria-label={label}
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
