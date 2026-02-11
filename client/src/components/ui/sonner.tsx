import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/**
 * Drop-in toast provider. Add `<Toaster />` once in your app root.
 *
 * Usage:
 *   import { toast } from "sonner";
 *   toast.success("Document uploaded!");
 *   toast.error("Upload failed");
 *   toast("Neutral message");
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "bg-card border-border text-foreground shadow-lg rounded-[var(--radius)]",
          title: "text-foreground font-semibold",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-secondary text-secondary-foreground",
          success: "!border-success/30",
          error: "!border-destructive/30",
          warning: "!border-warning/30",
        },
      }}
      {...props}
    />
  );
}
