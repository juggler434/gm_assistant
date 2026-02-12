import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export function GeneratePage() {
  return (
    <EmptyState
      icon={<Sparkles />}
      heading="Content Generation"
      description="Generate NPCs, encounters, lore, and more for your campaign. Coming soon."
    />
  );
}
