// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreateCampaign, useUpdateCampaign } from "@/hooks/use-campaigns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { Campaign } from "@/types";

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: Campaign;
}

export function CampaignFormDialog({ open, onOpenChange, campaign }: CampaignFormDialogProps) {
  const isEdit = !!campaign;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign(campaign?.id ?? "");
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (open) {
      setName(campaign?.name ?? "");
      setDescription(campaign?.description ?? "");
    }
  }, [open, campaign]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const data = {
      name: trimmedName,
      description: description.trim() || null,
    };

    if (isEdit) {
      updateMutation.mutate(data, {
        onSuccess: () => {
          toast.success("Campaign updated");
          onOpenChange(false);
        },
        onError: () => {
          toast.error("Failed to update campaign");
        },
      });
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          toast.success("Campaign created");
          onOpenChange(false);
        },
        onError: () => {
          toast.error("Failed to create campaign");
        },
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Campaign" : "New Campaign"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update your campaign details."
              : "Create a new campaign to start organizing your RPG world."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="campaign-name">Name</Label>
            <Input
              id="campaign-name"
              placeholder="e.g. Curse of Strahd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="campaign-description">Description</Label>
            <Textarea
              id="campaign-description"
              placeholder="A brief description of your campaign..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {isPending && <Spinner label="Saving" />}
              {isEdit ? "Save Changes" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
