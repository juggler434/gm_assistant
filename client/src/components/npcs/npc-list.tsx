// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { NpcCard } from "./npc-card";
import type { Npc, NpcStatus, NpcImportance } from "@/types";

interface NpcListProps {
  npcs: Npc[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelectNpc: (npc: Npc) => void;
  onRetry: () => void;
}

const ALL_VALUE = "__all__";

export function NpcList({ npcs, isLoading, error, onSelectNpc, onRetry }: NpcListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NpcStatus | "">("");
  const [importanceFilter, setImportanceFilter] = useState<NpcImportance | "">("");

  if (error) {
    return (
      <ErrorState
        heading="Failed to load NPCs"
        description={error.message}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const filtered = (npcs ?? []).filter((npc) => {
    if (search && !npc.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && npc.status !== statusFilter) return false;
    if (importanceFilter && npc.importance !== importanceFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search NPCs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter || ALL_VALUE}
          onValueChange={(v: string) => setStatusFilter(v === ALL_VALUE ? "" : v as NpcStatus)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
            <SelectItem value="alive">Alive</SelectItem>
            <SelectItem value="dead">Dead</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={importanceFilter || ALL_VALUE}
          onValueChange={(v: string) => setImportanceFilter(v === ALL_VALUE ? "" : v as NpcImportance)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Importance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All importance</SelectItem>
            <SelectItem value="major">Major</SelectItem>
            <SelectItem value="minor">Minor</SelectItem>
            <SelectItem value="background">Background</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users />}
          heading="No NPCs found"
          description={
            npcs && npcs.length > 0
              ? "No NPCs match your current filters. Try adjusting your search."
              : "Create your first NPC or generate some using AI."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((npc) => (
            <NpcCard key={npc.id} npc={npc} onClick={onSelectNpc} />
          ))}
        </div>
      )}
    </div>
  );
}
