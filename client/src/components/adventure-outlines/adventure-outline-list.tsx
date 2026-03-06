// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { AdventureOutlineCard } from "./adventure-outline-card";
import type { AdventureOutlineEntity } from "@/types";

interface AdventureOutlineListProps {
  outlines: AdventureOutlineEntity[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelectOutline: (outline: AdventureOutlineEntity) => void;
  onRetry: () => void;
}

export function AdventureOutlineList({
  outlines,
  isLoading,
  error,
  onSelectOutline,
  onRetry,
}: AdventureOutlineListProps) {
  const [search, setSearch] = useState("");

  if (error) {
    return (
      <ErrorState
        heading="Failed to load adventure outlines"
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

  const filtered = (outlines ?? []).filter((outline) => {
    if (search && !outline.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search adventure outlines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          heading="No adventure outlines found"
          description={
            outlines && outlines.length > 0
              ? "No outlines match your current search. Try adjusting your filter."
              : "Save outlines from the Generate page or create one manually."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((outline) => (
            <AdventureOutlineCard key={outline.id} outline={outline} onClick={onSelectOutline} />
          ))}
        </div>
      )}
    </div>
  );
}
