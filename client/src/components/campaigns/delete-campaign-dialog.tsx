// SPDX-License-Identifier: AGPL-3.0-or-later

import { toast } from "sonner";
import { useDeleteCampaign } from "@/hooks/use-campaigns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Campaign } from "@/types";

interface DeleteCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
}

export function DeleteCampaignDialog({ open, onOpenChange, campaign }: DeleteCampaignDialogProps) {
  const deleteMutation = useDeleteCampaign();

  function handleDelete() {
    deleteMutation.mutate(campaign.id, {
      onSuccess: () => {
        toast.success("Campaign deleted");
        onOpenChange(false);
      },
      onError: () => {
        toast.error("Failed to delete campaign");
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Campaign</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{campaign.name}</strong>? This will permanently
            remove the campaign and all its documents. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending && <Spinner label="Deleting" />}
            Delete Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
