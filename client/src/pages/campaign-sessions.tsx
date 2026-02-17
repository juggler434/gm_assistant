// SPDX-License-Identifier: AGPL-3.0-or-later

import { Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export function SessionsPage() {
  return (
    <EmptyState
      icon={<Clock />}
      heading="Session History"
      description="Track your game sessions and keep notes from each adventure. Coming soon."
    />
  );
}
