// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { useCampaigns } from "@/hooks/use-campaigns";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { CampaignFormDialog } from "@/components/campaigns/campaign-form-dialog";
import { DeleteCampaignDialog } from "@/components/campaigns/delete-campaign-dialog";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import type { Campaign } from "@/types";

export function CampaignListPage() {
  const { data: campaigns, isLoading, isError, refetch } = useCampaigns();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Your Campaigns</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          description="Failed to load campaigns. Please try again."
          onRetry={() => refetch()}
        />
      )}

      {campaigns && campaigns.length === 0 && (
        <EmptyState
          icon={<BookOpen />}
          heading="No campaigns yet"
          description="Create your first campaign to start organizing your RPG world."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Campaign
            </Button>
          }
        />
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onEdit={setEditCampaign}
              onDelete={setDeleteCampaign}
            />
          ))}
        </div>
      )}

      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editCampaign && (
        <CampaignFormDialog
          open={!!editCampaign}
          onOpenChange={(open) => {
            if (!open) setEditCampaign(null);
          }}
          campaign={editCampaign}
        />
      )}

      {deleteCampaign && (
        <DeleteCampaignDialog
          open={!!deleteCampaign}
          onOpenChange={(open) => {
            if (!open) setDeleteCampaign(null);
          }}
          campaign={deleteCampaign}
        />
      )}
    </div>
  );
}
