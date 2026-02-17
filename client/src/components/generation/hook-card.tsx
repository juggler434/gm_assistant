// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { RefreshCw, Users, MapPin, Shield, Copy, Check, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AdventureHook } from "@/types";

interface HookCardProps {
  hook: AdventureHook;
  index: number;
  isSaved: boolean;
  onSave: (hook: AdventureHook) => void;
  onUnsave: (hook: AdventureHook) => void;
  onRegenerateOne?: (index: number) => void;
  isStreaming?: boolean;
}

export function HookCard({
  hook,
  index,
  isSaved,
  onSave,
  onUnsave,
  onRegenerateOne,
  isStreaming,
}: HookCardProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const parts = [hook.title, "", hook.description];
    if (hook.npcs.length > 0) parts.push("", `NPCs: ${hook.npcs.join(", ")}`);
    if (hook.locations.length > 0) parts.push(`Locations: ${hook.locations.join(", ")}`);
    if (hook.factions.length > 0) parts.push(`Factions: ${hook.factions.join(", ")}`);

    navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSaveToggle() {
    if (isSaved) {
      onUnsave(hook);
    } else {
      onSave(hook);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{hook.title}</CardTitle>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSaveToggle}
              title={isSaved ? "Remove from saved" : "Save hook"}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-primary text-primary" : ""}`} />
            </Button>
            {onRegenerateOne && !isStreaming && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRegenerateOne(index)}
                title="Regenerate this hook"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{hook.description}</p>
        <div className="flex flex-wrap gap-2">
          {hook.npcs.length > 0 &&
            hook.npcs.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default" className="gap-1">
                <Users className="h-2.5 w-2.5" />
                {npc}
              </Badge>
            ))}
          {hook.locations.length > 0 &&
            hook.locations.map((loc, i) => (
              <Badge key={`loc-${i}`} variant="success" className="gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {loc}
              </Badge>
            ))}
          {hook.factions.length > 0 &&
            hook.factions.map((faction, i) => (
              <Badge key={`fac-${i}`} variant="warning" className="gap-1">
                <Shield className="h-2.5 w-2.5" />
                {faction}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
