// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { Clock } from "lucide-react";
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
import { SessionCard } from "./session-card";
import type { GameSession, GameSessionStatus } from "@/types";

interface SessionListProps {
  sessions: GameSession[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelectSession: (session: GameSession) => void;
  onRetry: () => void;
}

const ALL_VALUE = "__all__";

export function SessionList({
  sessions,
  isLoading,
  error,
  onSelectSession,
  onRetry,
}: SessionListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GameSessionStatus | "">("");

  if (error) {
    return (
      <ErrorState heading="Failed to load sessions" description={error.message} onRetry={onRetry} />
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

  const filtered = (sessions ?? []).filter((session) => {
    if (search && !session.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && session.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter || ALL_VALUE}
          onValueChange={(v: string) =>
            setStatusFilter(v === ALL_VALUE ? "" : (v as GameSessionStatus))
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
            <SelectItem value="recording">Recording</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Clock />}
          heading="No sessions found"
          description={
            sessions && sessions.length > 0
              ? "No sessions match your current filters. Try adjusting your search."
              : "Upload your first session recording to get started."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((session) => (
            <SessionCard key={session.id} session={session} onClick={onSelectSession} />
          ))}
        </div>
      )}
    </div>
  );
}
