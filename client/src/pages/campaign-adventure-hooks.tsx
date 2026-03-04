// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdventureHookList } from "@/components/adventure-hooks/adventure-hook-list";
import { AdventureHookForm } from "@/components/adventure-hooks/adventure-hook-form";
import { AdventureHookDetailDialog } from "@/components/adventure-hooks/adventure-hook-detail-dialog";
import {
  useAdventureHooks,
  useCreateAdventureHook,
  useUpdateAdventureHook,
  useDeleteAdventureHook,
} from "@/hooks/use-adventure-hooks";
import type { AdventureHookEntity, CreateAdventureHookRequest } from "@/types";

export function AdventureHooksPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: hooks, isLoading, error, refetch } = useAdventureHooks(campaignId ?? "");
  const createHook = useCreateAdventureHook(campaignId ?? "");
  const deleteHook = useDeleteAdventureHook(campaignId ?? "");

  const [formOpen, setFormOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<AdventureHookEntity | null>(null);
  const [detailHook, setDetailHook] = useState<AdventureHookEntity | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const updateHook = useUpdateAdventureHook(campaignId ?? "", editingHook?.id ?? "");

  const handleCreate = useCallback(() => {
    setEditingHook(null);
    setFormOpen(true);
  }, []);

  const handleSelectHook = useCallback((hook: AdventureHookEntity) => {
    setDetailHook(hook);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback((hook: AdventureHookEntity) => {
    setDetailOpen(false);
    setEditingHook(hook);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (hook: AdventureHookEntity) => {
      setDetailOpen(false);
      try {
        await deleteHook.mutateAsync(hook.id);
        toast.success(`${hook.title} deleted`);
      } catch {
        toast.error("Failed to delete adventure hook");
      }
    },
    [deleteHook]
  );

  const handleSubmit = useCallback(
    async (data: CreateAdventureHookRequest) => {
      try {
        if (editingHook) {
          await updateHook.mutateAsync(data);
          toast.success(`${data.title} updated`);
        } else {
          await createHook.mutateAsync(data);
          toast.success(`${data.title} created`);
        }
        setFormOpen(false);
        setEditingHook(null);
      } catch {
        toast.error(
          editingHook ? "Failed to update adventure hook" : "Failed to create adventure hook"
        );
      }
    },
    [editingHook, createHook, updateHook]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Adventure Hooks</h2>
          <p className="text-sm text-muted-foreground">
            Manage adventure hooks for this campaign
          </p>
        </div>
        <Button className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          Create Hook
        </Button>
      </div>

      <AdventureHookList
        hooks={hooks}
        isLoading={isLoading}
        error={error}
        onSelectHook={handleSelectHook}
        onRetry={() => refetch()}
      />

      <AdventureHookForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingHook(null);
        }}
        onSubmit={handleSubmit}
        isLoading={createHook.isPending || updateHook.isPending}
        hook={editingHook}
      />

      <AdventureHookDetailDialog
        hook={detailHook}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
