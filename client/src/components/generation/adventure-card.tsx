// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import {
  Copy,
  Check,
  Save,
  ChevronDown,
  ChevronRight,
  Swords,
  MessageSquare,
  Gem,
  Map as MapIcon,
  Users,
  MapPin,
  Shield,
  BookOpen,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CitedText, stripCitations } from "@/components/ui/cited-text";
import type { GeneratedAdventure, AdventureScene, AnswerSource } from "@/types";

// ============================================================================
// Scene Component
// ============================================================================

interface SceneCardProps {
  scene: AdventureScene;
  sceneIndex: number;
  sources: AnswerSource[];
}

function SceneCard({ scene, sceneIndex, sources }: SceneCardProps) {
  const [expanded, setExpanded] = useState(sceneIndex === 0);

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
        <Badge variant="outline" className="text-[10px]">
          Act {scene.actNumber}
        </Badge>
        <span className="text-sm font-medium text-foreground">{scene.title}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {/* GM Description */}
          <div>
            <h5 className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              GM Notes
            </h5>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <CitedText text={scene.description} sources={sources} />
            </p>
          </div>

          {/* Read Aloud */}
          {scene.readAloud && (
            <div className="rounded-md border-l-2 border-primary/50 bg-primary/5 px-3 py-2">
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                <BookOpen className="h-3 w-3" />
                Read Aloud
              </h5>
              <p className="text-sm italic leading-relaxed text-foreground/90">
                <CitedText text={scene.readAloud} sources={sources} />
              </p>
            </div>
          )}

          {/* NPC Dialogue */}
          {scene.npcDialogue.length > 0 && (
            <div>
              <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MessageSquare className="h-3 w-3 text-primary" />
                NPC Dialogue
              </h5>
              <div className="space-y-2">
                {scene.npcDialogue.map((line, i) => (
                  <div key={i} className="rounded-md bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-primary">
                        {line.npcName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ({line.context})
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm italic text-muted-foreground">
                      &ldquo;{stripCitations(line.dialogue)}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Encounters */}
          {scene.encounters.length > 0 && (
            <div>
              <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Swords className="h-3 w-3 text-warning" />
                Encounters
              </h5>
              <div className="space-y-2">
                {scene.encounters.map((enc, i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {enc.name}
                      </span>
                      <Badge
                        variant={
                          enc.difficulty === "deadly"
                            ? "destructive"
                            : enc.difficulty === "hard"
                              ? "warning"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {enc.difficulty}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <CitedText text={enc.description} sources={sources} />
                    </p>
                    {enc.creatures.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Creatures:</span>{" "}
                        {enc.creatures.map(stripCitations).join(", ")}
                      </p>
                    )}
                    {enc.tactics && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Tactics:</span>{" "}
                        <CitedText text={enc.tactics} sources={sources} />
                      </p>
                    )}
                    {enc.statBlock && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-primary">
                          Stat Block
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(enc.statBlock, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Treasure */}
          {scene.treasure.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Gem className="h-3 w-3 text-warning" />
                Treasure & Rewards
              </h5>
              <ul className="space-y-0.5">
                {scene.treasure.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="mr-1 text-warning">&bull;</span>
                    {stripCitations(item)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Map Suggestion */}
          {scene.mapSuggestion && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MapIcon className="h-3 w-3 text-primary" />
                Map Suggestion
              </h5>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <CitedText text={scene.mapSuggestion} sources={sources} />
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Adventure Card
// ============================================================================

interface AdventureCardProps {
  adventure: GeneratedAdventure;
  isSaving: boolean;
  onSave: (adventure: GeneratedAdventure) => void;
  sources?: AnswerSource[];
}

function adventureToMarkdown(adv: GeneratedAdventure): string {
  const s = stripCitations;
  const parts = [`# ${s(adv.title)}`, "", s(adv.synopsis), ""];
  if (adv.estimatedDuration) {
    parts.push(`**Estimated Duration:** ${adv.estimatedDuration}`, "");
  }

  const actGroups = new Map<number, AdventureScene[]>();
  for (const scene of adv.scenes) {
    const existing = actGroups.get(scene.actNumber) ?? [];
    existing.push(scene);
    actGroups.set(scene.actNumber, existing);
  }

  for (const [actNum, scenes] of actGroups) {
    parts.push(`## Act ${actNum}`, "");
    for (const scene of scenes) {
      parts.push(`### ${s(scene.title)}`, "");
      parts.push(s(scene.description), "");
      if (scene.readAloud) {
        parts.push("> **Read Aloud:**", `> ${s(scene.readAloud)}`, "");
      }
      if (scene.npcDialogue.length > 0) {
        parts.push("**NPC Dialogue:**", "");
        for (const line of scene.npcDialogue) {
          parts.push(`- **${s(line.npcName)}** *(${s(line.context)})*: "${s(line.dialogue)}"`);
        }
        parts.push("");
      }
      if (scene.encounters.length > 0) {
        parts.push("**Encounters:**", "");
        for (const enc of scene.encounters) {
          parts.push(`- **${s(enc.name)}** (${enc.difficulty}): ${s(enc.description)}`);
          if (enc.creatures.length > 0) {
            parts.push(`  - Creatures: ${enc.creatures.map(s).join(", ")}`);
          }
          if (enc.tactics) {
            parts.push(`  - Tactics: ${s(enc.tactics)}`);
          }
        }
        parts.push("");
      }
      if (scene.treasure.length > 0) {
        parts.push("**Treasure:**", "");
        scene.treasure.forEach((t: string) => parts.push(`- ${s(t)}`));
        parts.push("");
      }
      if (scene.mapSuggestion) {
        parts.push(`**Map:** ${s(scene.mapSuggestion)}`, "");
      }
    }
  }

  if (adv.npcs.length > 0) parts.push(`**NPCs:** ${adv.npcs.map(s).join(", ")}`, "");
  if (adv.locations.length > 0) parts.push(`**Locations:** ${adv.locations.map(s).join(", ")}`, "");
  if (adv.factions.length > 0) parts.push(`**Factions:** ${adv.factions.map(s).join(", ")}`, "");

  return parts.join("\n");
}

export function AdventureCard({
  adventure,
  isSaving,
  onSave,
  sources = [],
}: AdventureCardProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const md = adventureToMarkdown(adventure);
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{adventure.title}</CardTitle>
            {adventure.estimatedDuration && (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {adventure.estimatedDuration}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
              title="Copy as Markdown"
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
              onClick={() => onSave(adventure)}
              disabled={isSaving}
              title="Save to campaign"
            >
              {isSaving ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <CitedText text={adventure.synopsis} sources={sources} />
        </p>

        {adventure.scenes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Scenes ({adventure.scenes.length})
            </h4>
            {adventure.scenes.map((scene, idx) => (
              <SceneCard
                key={idx}
                scene={scene}
                sceneIndex={idx}
                sources={sources}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {adventure.npcs.length > 0 &&
            adventure.npcs.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default" className="gap-1">
                <Users className="h-2.5 w-2.5" />
                {stripCitations(npc)}
              </Badge>
            ))}
          {adventure.locations.length > 0 &&
            adventure.locations.map((loc, i) => (
              <Badge key={`loc-${i}`} variant="success" className="gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {stripCitations(loc)}
              </Badge>
            ))}
          {adventure.factions.length > 0 &&
            adventure.factions.map((faction, i) => (
              <Badge key={`fac-${i}`} variant="warning" className="gap-1">
                <Shield className="h-2.5 w-2.5" />
                {stripCitations(faction)}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
