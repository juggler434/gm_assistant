// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdventureOutlineList } from "@/components/adventure-outlines/adventure-outline-list";
import { AdventureOutlineForm } from "@/components/adventure-outlines/adventure-outline-form";
import { AdventureOutlineDetailDialog } from "@/components/adventure-outlines/adventure-outline-detail-dialog";
import {
  useAdventureOutlines,
  useCreateAdventureOutline,
  useUpdateAdventureOutline,
  useDeleteAdventureOutline,
} from "@/hooks/use-adventure-outlines";
import type { AdventureOutlineEntity, CreateAdventureOutlineRequest } from "@/types";

export function AdventureOutlinesPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: outlines, isLoading, error, refetch } = useAdventureOutlines(campaignId ?? "");
  const createOutline = useCreateAdventureOutline(campaignId ?? "");
  const deleteOutline = useDeleteAdventureOutline(campaignId ?? "");

  const [formOpen, setFormOpen] = useState(false);
  const [editingOutline, setEditingOutline] = useState<AdventureOutlineEntity | null>(null);
  const [detailOutline, setDetailOutline] = useState<AdventureOutlineEntity | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const updateOutline = useUpdateAdventureOutline(campaignId ?? "", editingOutline?.id ?? "");

  const handleCreate = useCallback(() => {
    setEditingOutline(null);
    setFormOpen(true);
  }, []);

  const handleSelectOutline = useCallback((outline: AdventureOutlineEntity) => {
    setDetailOutline(outline);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback((outline: AdventureOutlineEntity) => {
    setDetailOpen(false);
    setEditingOutline(outline);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (outline: AdventureOutlineEntity) => {
      setDetailOpen(false);
      try {
        await deleteOutline.mutateAsync(outline.id);
        toast.success(`${outline.title} deleted`);
      } catch {
        toast.error("Failed to delete adventure outline");
      }
    },
    [deleteOutline]
  );

  const handleSubmit = useCallback(
    async (data: CreateAdventureOutlineRequest) => {
      try {
        if (editingOutline) {
          await updateOutline.mutateAsync(data);
          toast.success(`${data.title} updated`);
        } else {
          await createOutline.mutateAsync(data);
          toast.success(`${data.title} created`);
        }
        setFormOpen(false);
        setEditingOutline(null);
      } catch {
        toast.error(
          editingOutline
            ? "Failed to update adventure outline"
            : "Failed to create adventure outline"
        );
      }
    },
    [editingOutline, createOutline, updateOutline]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Adventure Outlines</h2>
          <p className="text-sm text-muted-foreground">
            Manage adventure outlines for this campaign
          </p>
        </div>
        <Button className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          Create Outline
        </Button>
      </div>

      <AdventureOutlineList
        outlines={outlines}
        isLoading={isLoading}
        error={error}
        onSelectOutline={handleSelectOutline}
        onRetry={() => refetch()}
      />

      <AdventureOutlineForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingOutline(null);
        }}
        onSubmit={handleSubmit}
        isLoading={createOutline.isPending || updateOutline.isPending}
        outline={editingOutline}
      />

      <AdventureOutlineDetailDialog
        outline={detailOutline}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
