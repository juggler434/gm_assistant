// SPDX-License-Identifier: AGPL-3.0-or-later

import { Users, MapPin, Shield, BookOpen, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stripCitations } from "@/components/ui/cited-text";
import type { AdventureEntity } from "@/types";

interface AdventureBrowseCardProps {
  adventure: AdventureEntity;
  onClick: (adventure: AdventureEntity) => void;
}

export function AdventureBrowseCard({ adventure, onClick }: AdventureBrowseCardProps) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => onClick(adventure)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{adventure.title}</CardTitle>
          {adventure.isGenerated && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Generated
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-3 text-sm text-muted-foreground">{stripCitations(adventure.synopsis)}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {adventure.nodes && adventure.nodes.length > 0 ? (
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {adventure.nodes.length} {adventure.nodes.length === 1 ? "node" : "nodes"}
            </span>
          ) : adventure.scenes.length > 0 ? (
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {adventure.scenes.length} {adventure.scenes.length === 1 ? "scene" : "scenes"}
            </span>
          ) : null}
          {adventure.estimatedDuration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {adventure.estimatedDuration}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {adventure.npcs &&
            adventure.npcs.length > 0 &&
            adventure.npcs.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default" className="gap-1 text-[10px]">
                <Users className="h-2.5 w-2.5" />
                {stripCitations(npc)}
              </Badge>
            ))}
          {adventure.locations &&
            adventure.locations.length > 0 &&
            adventure.locations.map((loc, i) => (
              <Badge key={`loc-${i}`} variant="success" className="gap-1 text-[10px]">
                <MapPin className="h-2.5 w-2.5" />
                {stripCitations(loc)}
              </Badge>
            ))}
          {adventure.factions &&
            adventure.factions.length > 0 &&
            adventure.factions.map((faction, i) => (
              <Badge key={`fac-${i}`} variant="warning" className="gap-1 text-[10px]">
                <Shield className="h-2.5 w-2.5" />
                {stripCitations(faction)}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
