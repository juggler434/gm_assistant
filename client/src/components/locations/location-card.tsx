// SPDX-License-Identifier: AGPL-3.0-or-later

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Location } from "@/types";

interface LocationCardProps {
  location: Location;
  onClick: (location: Location) => void;
}

export function LocationCard({ location, onClick }: LocationCardProps) {
  const subtitle = [location.terrain, location.climate, location.size]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => onClick(location)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{location.name}</CardTitle>
          {location.isGenerated && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Generated
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent>
        {location.readAloud ? (
          <p className="line-clamp-3 text-sm italic text-muted-foreground">
            {location.readAloud}
          </p>
        ) : location.keyFeatures && location.keyFeatures.length > 0 ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {location.keyFeatures.join(", ")}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No description available
          </p>
        )}
        {location.tags && location.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {location.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
            {location.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{location.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
