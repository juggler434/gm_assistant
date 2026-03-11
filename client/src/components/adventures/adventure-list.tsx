// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { AdventureBrowseCard } from "./adventure-browse-card";
import type { AdventureEntity } from "@/types";

interface AdventureListProps {
  adventures: AdventureEntity[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelectAdventure: (adventure: AdventureEntity) => void;
  onRetry: () => void;
}

export function AdventureList({
  adventures,
  isLoading,
  error,
  onSelectAdventure,
  onRetry,
}: AdventureListProps) {
  const [search, setSearch] = useState("");

  if (error) {
    return (
      <ErrorState
        heading="Failed to load adventures"
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

  const filtered = (adventures ?? []).filter((adventure) => {
    if (search && !adventure.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search adventures..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          heading="No adventures found"
          description={
            adventures && adventures.length > 0
              ? "No adventures match your current search. Try adjusting your filter."
              : "Save adventures from the Generate page or create one manually."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((adventure) => (
            <AdventureBrowseCard key={adventure.id} adventure={adventure} onClick={onSelectAdventure} />
          ))}
        </div>
      )}
    </div>
  );
}
