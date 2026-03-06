// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import {
  RefreshCw,
  Users,
  MapPin,
  Shield,
  Copy,
  Check,
  Save,
  ChevronDown,
  ChevronRight,
  Swords,
  Milestone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CitedText } from "@/components/ui/cited-text";
import type { GeneratedAdventureOutline, OutlineAct, AnswerSource } from "@/types";

interface OutlineSectionProps {
  act: OutlineAct;
  actIndex: number;
  sources: AnswerSource[];
}

function OutlineSection({ act, actIndex, sources }: OutlineSectionProps) {
  const [expanded, setExpanded] = useState(actIndex === 0);

  return (
    <div className="rounded-md border border-border bg-secondary/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground">{act.title}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <CitedText text={act.description} sources={sources} />
          </p>

          {act.keyEvents.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Milestone className="h-3 w-3 text-primary" />
                Key Events
              </h5>
              <ul className="space-y-1">
                {act.keyEvents.map((event, i) => (
                  <li key={i} className="text-xs leading-relaxed text-muted-foreground">
                    <span className="mr-1 text-primary">&bull;</span>
                    <CitedText text={event} sources={sources} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {act.encounters.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Swords className="h-3 w-3 text-warning" />
                Encounters
              </h5>
              <ul className="space-y-1">
                {act.encounters.map((encounter, i) => (
                  <li key={i} className="text-xs leading-relaxed text-muted-foreground">
                    <span className="mr-1 text-warning">&bull;</span>
                    <CitedText text={encounter} sources={sources} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface OutlineCardProps {
  outline: GeneratedAdventureOutline;
  index: number;
  isSaving: boolean;
  onSave: (outline: GeneratedAdventureOutline, index: number) => void;
  onRegenerateOne?: (index: number) => void;
  isStreaming?: boolean;
  sources?: AnswerSource[];
}

export function OutlineCard({
  outline,
  index,
  isSaving,
  onSave,
  onRegenerateOne,
  isStreaming,
  sources = [],
}: OutlineCardProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const parts = [outline.title, "", outline.description];
    for (const act of outline.acts) {
      parts.push("", `## ${act.title}`, act.description);
      if (act.keyEvents.length > 0) {
        parts.push("", "Key Events:");
        act.keyEvents.forEach((e) => parts.push(`- ${e}`));
      }
      if (act.encounters.length > 0) {
        parts.push("", "Encounters:");
        act.encounters.forEach((e) => parts.push(`- ${e}`));
      }
    }
    if (outline.npcs.length > 0) parts.push("", `NPCs: ${outline.npcs.join(", ")}`);
    if (outline.locations.length > 0) parts.push(`Locations: ${outline.locations.join(", ")}`);
    if (outline.factions.length > 0) parts.push(`Factions: ${outline.factions.join(", ")}`);

    navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{outline.title}</CardTitle>
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
              onClick={() => onSave(outline, index)}
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
                title="Regenerate this outline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <CitedText text={outline.description} sources={sources} />
        </p>

        {outline.acts.length > 0 && (
          <div className="space-y-2">
            {outline.acts.map((act, actIndex) => (
              <OutlineSection
                key={actIndex}
                act={act}
                actIndex={actIndex}
                sources={sources}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {outline.npcs.length > 0 &&
            outline.npcs.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default" className="gap-1">
                <Users className="h-2.5 w-2.5" />
                {npc}
              </Badge>
            ))}
          {outline.locations.length > 0 &&
            outline.locations.map((loc, i) => (
              <Badge key={`loc-${i}`} variant="success" className="gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {loc}
              </Badge>
            ))}
          {outline.factions.length > 0 &&
            outline.factions.map((faction, i) => (
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
