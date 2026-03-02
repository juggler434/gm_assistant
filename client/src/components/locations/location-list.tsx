// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { LocationCard } from "./location-card";
import type { Location } from "@/types";

interface LocationListProps {
  locations: Location[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelectLocation: (location: Location) => void;
  onRetry: () => void;
}

export function LocationList({
  locations,
  isLoading,
  error,
  onSelectLocation,
  onRetry,
}: LocationListProps) {
  const [search, setSearch] = useState("");

  if (error) {
    return (
      <ErrorState
        heading="Failed to load locations"
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

  const filtered = (locations ?? []).filter((location) => {
    if (search && !location.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search locations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MapPin />}
          heading="No locations found"
          description={
            locations && locations.length > 0
              ? "No locations match your search. Try adjusting your query."
              : "Generate locations using AI or create one manually."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onClick={onSelectLocation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
