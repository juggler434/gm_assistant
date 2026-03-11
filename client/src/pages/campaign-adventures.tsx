// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { AdventureList } from "@/components/adventures/adventure-list";
import { AdventureDetailDialog } from "@/components/adventures/adventure-detail-dialog";
import {
  useAdventures,
  useDeleteAdventure,
} from "@/hooks/use-adventures";
import type { AdventureEntity } from "@/types";

export function AdventuresPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: adventures, isLoading, error, refetch } = useAdventures(campaignId ?? "");
  const deleteAdventure = useDeleteAdventure(campaignId ?? "");

  const [detailAdventure, setDetailAdventure] = useState<AdventureEntity | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleSelectAdventure = useCallback((adventure: AdventureEntity) => {
    setDetailAdventure(adventure);
    setDetailOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (adventure: AdventureEntity) => {
      setDetailOpen(false);
      try {
        await deleteAdventure.mutateAsync(adventure.id);
        toast.success(`${adventure.title} deleted`);
      } catch {
        toast.error("Failed to delete adventure");
      }
    },
    [deleteAdventure]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Adventures</h2>
        <p className="text-sm text-muted-foreground">
          Browse and manage full adventures for this campaign
        </p>
      </div>

      <AdventureList
        adventures={adventures}
        isLoading={isLoading}
        error={error}
        onSelectAdventure={handleSelectAdventure}
        onRetry={() => refetch()}
      />

      <AdventureDetailDialog
        adventure={detailAdventure}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={handleDelete}
      />
    </div>
  );
}
