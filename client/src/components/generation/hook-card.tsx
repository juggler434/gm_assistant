// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { RefreshCw, Users, MapPin, Shield, Copy, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CitedText } from "@/components/ui/cited-text";
import type { AdventureHook, AnswerSource } from "@/types";

interface HookCardProps {
  hook: AdventureHook;
  index: number;
  isSaving: boolean;
  onSave: (hook: AdventureHook, index: number) => void;
  onRegenerateOne?: (index: number) => void;
  isStreaming?: boolean;
  sources?: AnswerSource[];
}

export function HookCard({
  hook,
  index,
  isSaving,
  onSave,
  onRegenerateOne,
  isStreaming,
  sources = [],
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
              onClick={() => onSave(hook, index)}
              disabled={isSaving}
              title="Save to campaign"
            >
              {isSaving ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
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
        <p className="text-sm leading-relaxed text-muted-foreground">
          <CitedText text={hook.description} sources={sources} />
        </p>
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
