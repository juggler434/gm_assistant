import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export function QueryPage() {
  return (
    <EmptyState
      icon={<MessageSquare />}
      heading="AI Query"
      description="Ask questions about your campaign documents using AI-powered search. Coming soon."
    />
  );
}
