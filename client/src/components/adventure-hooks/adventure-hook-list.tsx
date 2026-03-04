// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { AdventureHookCard } from "./adventure-hook-card";
import type { AdventureHookEntity } from "@/types";

interface AdventureHookListProps {
  hooks: AdventureHookEntity[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelectHook: (hook: AdventureHookEntity) => void;
  onRetry: () => void;
}

export function AdventureHookList({
  hooks,
  isLoading,
  error,
  onSelectHook,
  onRetry,
}: AdventureHookListProps) {
  const [search, setSearch] = useState("");

  if (error) {
    return (
      <ErrorState
        heading="Failed to load adventure hooks"
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

  const filtered = (hooks ?? []).filter((hook) => {
    if (search && !hook.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search adventure hooks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bookmark />}
          heading="No adventure hooks found"
          description={
            hooks && hooks.length > 0
              ? "No hooks match your current search. Try adjusting your filter."
              : "Save hooks from the Generate page or create one manually."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((hook) => (
            <AdventureHookCard key={hook.id} hook={hook} onClick={onSelectHook} />
          ))}
        </div>
      )}
    </div>
  );
}
