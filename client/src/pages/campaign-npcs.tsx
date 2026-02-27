// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NpcList } from "@/components/npcs/npc-list";
import { NpcForm } from "@/components/npcs/npc-form";
import { NpcDetailDialog } from "@/components/npcs/npc-detail-dialog";
import { useNpcs, useCreateNpc, useUpdateNpc, useDeleteNpc } from "@/hooks/use-npcs";
import type { Npc, CreateNpcRequest } from "@/types";

export function NpcsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: npcs, isLoading, error, refetch } = useNpcs(campaignId ?? "");
  const createNpc = useCreateNpc(campaignId ?? "");
  const deleteNpc = useDeleteNpc(campaignId ?? "");

  const [formOpen, setFormOpen] = useState(false);
  const [editingNpc, setEditingNpc] = useState<Npc | null>(null);
  const [detailNpc, setDetailNpc] = useState<Npc | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // We need a dynamic hook for updating — use the editing NPC's ID
  const updateNpc = useUpdateNpc(campaignId ?? "", editingNpc?.id ?? "");

  const handleCreate = useCallback(() => {
    setEditingNpc(null);
    setFormOpen(true);
  }, []);

  const handleSelectNpc = useCallback((npc: Npc) => {
    setDetailNpc(npc);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback((npc: Npc) => {
    setDetailOpen(false);
    setEditingNpc(npc);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (npc: Npc) => {
      setDetailOpen(false);
      try {
        await deleteNpc.mutateAsync(npc.id);
        toast.success(`${npc.name} deleted`);
      } catch {
        toast.error("Failed to delete NPC");
      }
    },
    [deleteNpc]
  );

  const handleSubmit = useCallback(
    async (data: CreateNpcRequest) => {
      try {
        if (editingNpc) {
          await updateNpc.mutateAsync(data);
          toast.success(`${data.name} updated`);
        } else {
          await createNpc.mutateAsync(data);
          toast.success(`${data.name} created`);
        }
        setFormOpen(false);
        setEditingNpc(null);
      } catch {
        toast.error(editingNpc ? "Failed to update NPC" : "Failed to create NPC");
      }
    },
    [editingNpc, createNpc, updateNpc]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">NPCs</h2>
          <p className="text-sm text-muted-foreground">
            Manage non-player characters for this campaign
          </p>
        </div>
        <Button className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          Create NPC
        </Button>
      </div>

      <NpcList
        npcs={npcs}
        isLoading={isLoading}
        error={error}
        onSelectNpc={handleSelectNpc}
        onRetry={() => refetch()}
      />

      <NpcForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingNpc(null);
        }}
        onSubmit={handleSubmit}
        isLoading={createNpc.isPending || updateNpc.isPending}
        npc={editingNpc}
      />

      <NpcDetailDialog
        npc={detailNpc}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
