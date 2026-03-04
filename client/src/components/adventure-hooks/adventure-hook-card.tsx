// SPDX-License-Identifier: AGPL-3.0-or-later

import { Users, MapPin, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdventureHookEntity } from "@/types";

interface AdventureHookCardProps {
  hook: AdventureHookEntity;
  onClick: (hook: AdventureHookEntity) => void;
}

export function AdventureHookCard({ hook, onClick }: AdventureHookCardProps) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => onClick(hook)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{hook.title}</CardTitle>
          {hook.isGenerated && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Generated
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {hook.description}
        </p>
        <div className="flex flex-wrap gap-2">
          {hook.npcs &&
            hook.npcs.length > 0 &&
            hook.npcs.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default" className="gap-1 text-[10px]">
                <Users className="h-2.5 w-2.5" />
                {npc}
              </Badge>
            ))}
          {hook.locations &&
            hook.locations.length > 0 &&
            hook.locations.map((loc, i) => (
              <Badge key={`loc-${i}`} variant="success" className="gap-1 text-[10px]">
                <MapPin className="h-2.5 w-2.5" />
                {loc}
              </Badge>
            ))}
          {hook.factions &&
            hook.factions.length > 0 &&
            hook.factions.map((faction, i) => (
              <Badge key={`fac-${i}`} variant="warning" className="gap-1 text-[10px]">
                <Shield className="h-2.5 w-2.5" />
                {faction}
              </Badge>
            ))}
        </div>
        {hook.tags && hook.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hook.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
            {hook.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{hook.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
