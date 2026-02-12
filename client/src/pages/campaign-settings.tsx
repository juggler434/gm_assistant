import { Settings } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export function SettingsPage() {
  return (
    <EmptyState
      icon={<Settings />}
      heading="Campaign Settings"
      description="Configure your campaign details, sharing, and preferences. Coming soon."
    />
  );
}
