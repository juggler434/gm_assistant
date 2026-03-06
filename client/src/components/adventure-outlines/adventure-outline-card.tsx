// SPDX-License-Identifier: AGPL-3.0-or-later

import { Users, MapPin, Shield, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdventureOutlineEntity } from "@/types";

interface AdventureOutlineCardProps {
  outline: AdventureOutlineEntity;
  onClick: (outline: AdventureOutlineEntity) => void;
}

export function AdventureOutlineCard({ outline, onClick }: AdventureOutlineCardProps) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => onClick(outline)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{outline.title}</CardTitle>
          {outline.isGenerated && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Generated
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-3 text-sm text-muted-foreground">{outline.description}</p>
        {outline.acts.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <BookOpen className="h-3 w-3" />
            <span>{outline.acts.length} {outline.acts.length === 1 ? "act" : "acts"}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {outline.npcs &&
            outline.npcs.length > 0 &&
            outline.npcs.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default" className="gap-1 text-[10px]">
                <Users className="h-2.5 w-2.5" />
                {npc}
              </Badge>
            ))}
          {outline.locations &&
            outline.locations.length > 0 &&
            outline.locations.map((loc, i) => (
              <Badge key={`loc-${i}`} variant="success" className="gap-1 text-[10px]">
                <MapPin className="h-2.5 w-2.5" />
                {loc}
              </Badge>
            ))}
          {outline.factions &&
            outline.factions.length > 0 &&
            outline.factions.map((faction, i) => (
              <Badge key={`fac-${i}`} variant="warning" className="gap-1 text-[10px]">
                <Shield className="h-2.5 w-2.5" />
                {faction}
              </Badge>
            ))}
        </div>
        {outline.tags && outline.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {outline.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
            {outline.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{outline.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
