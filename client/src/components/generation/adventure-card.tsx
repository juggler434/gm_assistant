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
  AlertTriangle,
  Link,
  Eye,
  EyeOff,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CitedText, stripCitations } from "@/components/ui/cited-text";
import type {
  GeneratedAdventure,
  AdventureScene,
  AdventureNode,
  AnswerSource,
} from "@/types";

// ============================================================================
// Shared Sub-components
// ============================================================================

function EncounterList({ encounters, sources }: { encounters: AdventureScene["encounters"]; sources: AnswerSource[] }) {
  return (
    <div>
      <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Swords className="h-3 w-3 text-warning" />
        Encounters
      </h5>
      <div className="space-y-2">
        {encounters.map((enc, i) => (
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
  );
}

function TreasureList({ treasure }: { treasure: string[] }) {
  return (
    <div>
      <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Gem className="h-3 w-3 text-warning" />
        Treasure & Rewards
      </h5>
      <ul className="space-y-0.5">
        {treasure.map((item, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            <span className="mr-1 text-warning">&bull;</span>
            {stripCitations(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MapSuggestion({ text, sources }: { text: string; sources: AnswerSource[] }) {
  return (
    <div>
      <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <MapIcon className="h-3 w-3 text-primary" />
        Map Suggestion
      </h5>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <CitedText text={text} sources={sources} />
      </p>
    </div>
  );
}

// ============================================================================
// Node-Based Adventure Components
// ============================================================================

interface NodeCardProps {
  node: AdventureNode;
  nodeIndex: number;
  allNodes: AdventureNode[];
  sources: AnswerSource[];
  onScrollToNode?: (nodeId: string) => void;
}

function NodeCard({ node, nodeIndex, allNodes, sources, onScrollToNode }: NodeCardProps) {
  const [expanded, setExpanded] = useState(nodeIndex === 0);

  const nodeTypeBadge = {
    location: { variant: "success" as const, label: "Location" },
    event: { variant: "warning" as const, label: "Event" },
    encounter: { variant: "destructive" as const, label: "Encounter" },
    social: { variant: "default" as const, label: "Social" },
  }[node.type] ?? { variant: "secondary" as const, label: node.type };

  const resolveNodeName = (nodeId: string) => {
    const target = allNodes.find((n) => n.id === nodeId);
    return target ? target.name : nodeId;
  };

  return (
    <div id={`node-${node.id}`} className="rounded-md border border-border bg-secondary/30">
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
        <Badge variant={nodeTypeBadge.variant} className="text-[10px]">
          {nodeTypeBadge.label}
        </Badge>
        {node.isEntryPoint && (
          <Star className="h-3 w-3 shrink-0 text-warning fill-warning" />
        )}
        <span className="text-sm font-medium text-foreground">{node.name}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {/* GM Description */}
          <div>
            <h5 className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              GM Notes
            </h5>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <CitedText text={node.description} sources={sources} />
            </p>
          </div>

          {/* Read Aloud */}
          {node.readAloud && (
            <div className="rounded-md border-l-2 border-primary/50 bg-primary/5 px-3 py-2">
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                <BookOpen className="h-3 w-3" />
                Read Aloud
              </h5>
              <p className="text-sm italic leading-relaxed text-foreground/90">
                <CitedText text={node.readAloud} sources={sources} />
              </p>
            </div>
          )}

          {/* Clues */}
          {node.clues.length > 0 && (
            <div>
              <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Link className="h-3 w-3 text-primary" />
                Clues
              </h5>
              <div className="space-y-1.5">
                {node.clues.map((clue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-card px-3 py-2"
                  >
                    {clue.isHidden ? (
                      <EyeOff className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <Eye className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {stripCitations(clue.description)}
                      </p>
                      <button
                        type="button"
                        className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onScrollToNode?.(clue.pointsTo);
                        }}
                      >
                        → {resolveNodeName(clue.pointsTo)}
                      </button>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[9px]">
                      {clue.type.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NPC Dialogue */}
          {node.npcDialogue.length > 0 && (
            <div>
              <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MessageSquare className="h-3 w-3 text-primary" />
                NPC Dialogue
              </h5>
              <div className="space-y-2">
                {node.npcDialogue.map((line, i) => (
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
          {node.encounters.length > 0 && (
            <EncounterList encounters={node.encounters} sources={sources} />
          )}

          {/* Treasure */}
          {node.treasure.length > 0 && (
            <TreasureList treasure={node.treasure} />
          )}

          {/* Map Suggestion */}
          {node.mapSuggestion && (
            <MapSuggestion text={node.mapSuggestion} sources={sources} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Markdown Export
// ============================================================================

function adventureToMarkdown(adv: GeneratedAdventure): string {
  const s = stripCitations;
  const parts = [`# ${s(adv.title)}`, "", s(adv.synopsis), ""];
  if (adv.estimatedDuration) {
    parts.push(`**Estimated Duration:** ${adv.estimatedDuration}`, "");
  }

  // Node-based adventure
  if (adv.front) {
    parts.push("## The Situation", "");
    parts.push(s(adv.front.description), "");
    parts.push(`**Stakes:** ${s(adv.front.stakes)}`, "");

    if (adv.front.keyFactions.length > 0) {
      parts.push("### Factions", "");
      for (const f of adv.front.keyFactions) {
        parts.push(`- **${s(f.name)}**: ${s(f.goal)}`);
        parts.push(`  - Resources: ${s(f.resources)}`);
      }
      parts.push("");
    }

    if (adv.doomTimeline.length > 0) {
      parts.push("## Doom Timeline", "");
      for (const t of adv.doomTimeline) {
        parts.push(`### ${t.stage}. ${s(t.label)}`, "");
        parts.push(s(t.event), "");
        parts.push(`*Consequence:* ${s(t.consequence)}`, "");
        if (t.nodesAffected.length > 0) {
          const names = t.nodesAffected.map((id) => {
            const node = adv.nodes.find((n) => n.id === id);
            return node ? node.name : id;
          });
          parts.push(`*Affects:* ${names.join(", ")}`, "");
        }
      }
    }

    if (adv.nodes.length > 0) {
      parts.push("## Nodes", "");
      for (const node of adv.nodes) {
        const markers = [];
        if (node.isEntryPoint) markers.push("ENTRY POINT");
        markers.push(node.type);
        parts.push(`### ${s(node.name)} [${markers.join(" | ")}]`, "");
        parts.push(s(node.description), "");

        if (node.readAloud) {
          parts.push("> **Read Aloud:**", `> ${s(node.readAloud)}`, "");
        }

        if (node.clues.length > 0) {
          parts.push("**Clues:**", "");
          for (const clue of node.clues) {
            const target = adv.nodes.find((n) => n.id === clue.pointsTo);
            const targetName = target ? target.name : clue.pointsTo;
            const hidden = clue.isHidden ? " (hidden)" : "";
            parts.push(`- ${s(clue.description)} → **${targetName}**${hidden}`);
          }
          parts.push("");
        }

        if (node.npcDialogue.length > 0) {
          parts.push("**NPC Dialogue:**", "");
          for (const line of node.npcDialogue) {
            parts.push(`- **${s(line.npcName)}** *(${s(line.context)})*: "${s(line.dialogue)}"`);
          }
          parts.push("");
        }

        if (node.encounters.length > 0) {
          parts.push("**Encounters:**", "");
          for (const enc of node.encounters) {
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

        if (node.treasure.length > 0) {
          parts.push("**Treasure:**", "");
          node.treasure.forEach((t: string) => parts.push(`- ${s(t)}`));
          parts.push("");
        }

        if (node.mapSuggestion) {
          parts.push(`**Map:** ${s(node.mapSuggestion)}`, "");
        }
      }
    }
  }

  if (adv.npcs.length > 0) parts.push(`**NPCs:** ${adv.npcs.map(s).join(", ")}`, "");
  if (adv.locations.length > 0) parts.push(`**Locations:** ${adv.locations.map(s).join(", ")}`, "");
  if (adv.factions.length > 0) parts.push(`**Factions:** ${adv.factions.map(s).join(", ")}`, "");

  return parts.join("\n");
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

  function handleScrollToNode(nodeId: string) {
    const el = document.getElementById(`node-${nodeId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <CitedText text={adventure.synopsis} sources={sources} />
        </p>

        {/* Node-based adventure content */}
        {adventure.front && (
          <>
            {/* Front / Situation */}
            <div className="rounded-md border border-border bg-card p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground uppercase tracking-wide">
                <AlertTriangle className="h-3 w-3 text-warning" />
                The Situation
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                <CitedText text={adventure.front.description} sources={sources} />
              </p>
              <div className="mt-2 rounded bg-destructive/10 px-2 py-1">
                <p className="text-xs font-medium text-destructive">
                  Stakes: {stripCitations(adventure.front.stakes)}
                </p>
              </div>
              {adventure.front.keyFactions.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {adventure.front.keyFactions.map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Shield className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                      <div>
                        <span className="text-xs font-semibold text-foreground">
                          {stripCitations(f.name)}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Goal: {stripCitations(f.goal)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Resources: {stripCitations(f.resources)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Doom Timeline */}
            {adventure.doomTimeline.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground uppercase tracking-wide">
                  <Clock className="h-3 w-3 text-destructive" />
                  Doom Timeline
                </h4>
                <div className="relative space-y-0 border-l-2 border-destructive/30 pl-4">
                  {adventure.doomTimeline.map((stage, i) => (
                    <div key={i} className="relative pb-3">
                      <div className="absolute -left-[calc(1rem+5px)] top-1.5 h-2 w-2 rounded-full bg-destructive/60" />
                      <div className="text-xs font-semibold text-foreground">
                        {stage.label}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stripCitations(stage.event)}
                      </p>
                      <p className="text-xs italic text-muted-foreground/80">
                        {stripCitations(stage.consequence)}
                      </p>
                      {stage.nodesAffected.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {stage.nodesAffected.map((nodeId) => {
                            const node = adventure.nodes.find((n) => n.id === nodeId);
                            return (
                              <button
                                key={nodeId}
                                type="button"
                                className="text-[10px] text-primary hover:underline"
                                onClick={() => handleScrollToNode(nodeId)}
                              >
                                {node ? node.name : nodeId}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nodes */}
            {adventure.nodes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Nodes ({adventure.nodes.length})
                </h4>
                {adventure.nodes.map((node, idx) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    nodeIndex={idx}
                    allNodes={adventure.nodes}
                    sources={sources}
                    onScrollToNode={handleScrollToNode}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Entity badges */}
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
