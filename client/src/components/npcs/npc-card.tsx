// SPDX-License-Identifier: AGPL-3.0-or-later

import { User, Skull, HelpCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Npc, NpcStatus, NpcImportance } from "@/types";

const STATUS_CONFIG: Record<NpcStatus, { label: string; variant: "default" | "destructive" | "secondary" | "warning"; icon: typeof User }> = {
  alive: { label: "Alive", variant: "default", icon: User },
  dead: { label: "Dead", variant: "destructive", icon: Skull },
  unknown: { label: "Unknown", variant: "secondary", icon: HelpCircle },
  missing: { label: "Missing", variant: "warning", icon: Search },
};

const IMPORTANCE_CONFIG: Record<NpcImportance, { label: string; variant: "default" | "secondary" | "outline" }> = {
  major: { label: "Major", variant: "default" },
  minor: { label: "Minor", variant: "secondary" },
  background: { label: "Background", variant: "outline" },
};

interface NpcCardProps {
  npc: Npc;
  onClick: (npc: Npc) => void;
}

export function NpcCard({ npc, onClick }: NpcCardProps) {
  const statusConfig = STATUS_CONFIG[npc.status];
  const importanceConfig = IMPORTANCE_CONFIG[npc.importance];

  const subtitle = [npc.race, npc.classRole].filter(Boolean).join(" · ");

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => onClick(npc)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{npc.name}</CardTitle>
          <div className="flex shrink-0 gap-1">
            <Badge variant={importanceConfig.variant} className="text-[10px]">
              {importanceConfig.label}
            </Badge>
            <Badge variant={statusConfig.variant} className="text-[10px]">
              {statusConfig.label}
            </Badge>
          </div>
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
        {npc.level && (
          <p className="text-xs text-muted-foreground">{npc.level}</p>
        )}
      </CardHeader>
      <CardContent>
        {npc.backstory ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {npc.backstory}
          </p>
        ) : npc.personality ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {npc.personality}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No description available
          </p>
        )}
        {npc.tags && npc.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {npc.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
            {npc.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{npc.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
