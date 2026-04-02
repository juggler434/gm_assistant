// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Trash2,
  Users,
  MapPin,
  Shield,
  BookOpen,
  MessageSquare,
  Swords,
  Gem,
  Map,
  Clock,
  Copy,
  Check,
  AlertTriangle,
  Link,
  Eye,
  EyeOff,
  Star,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { stripCitations } from "@/components/ui/cited-text";
import type { AdventureEntity, AdventureScene, AdventureNode } from "@/types";

// ============================================================================
// Legacy Scene Detail (for old linear adventures)
// ============================================================================

interface SceneDetailProps {
  scene: AdventureScene;
  index: number;
}

function SceneDetail({ scene, index }: SceneDetailProps) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
      >
        <Badge variant="outline" className="text-[10px]">
          Act {scene.actNumber}
        </Badge>
        <span className="text-sm font-medium text-foreground">{scene.title}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {stripCitations(scene.description)}
          </p>

          {scene.readAloud && (
            <div className="rounded-md border-l-2 border-primary/50 bg-primary/5 px-3 py-2">
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                <BookOpen className="h-3 w-3" />
                Read Aloud
              </h5>
              <p className="text-sm italic text-foreground/90">{stripCitations(scene.readAloud)}</p>
            </div>
          )}

          {scene.npcDialogue.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MessageSquare className="h-3 w-3 text-primary" />
                NPC Dialogue
              </h5>
              <div className="space-y-1.5">
                {scene.npcDialogue.map((line, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-semibold text-primary">{line.npcName}</span>
                    <span className="text-muted-foreground"> ({line.context}): </span>
                    <span className="italic text-foreground">&ldquo;{stripCitations(line.dialogue)}&rdquo;</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scene.encounters.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Swords className="h-3 w-3 text-warning" />
                Encounters
              </h5>
              {scene.encounters.map((enc, i) => (
                <div key={i} className="mt-1 rounded-md border border-border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{enc.name}</span>
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
                  <p className="text-xs text-muted-foreground">{stripCitations(enc.description)}</p>
                  {enc.creatures.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Creatures: {enc.creatures.map(stripCitations).join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {scene.treasure.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Gem className="h-3 w-3 text-warning" />
                Treasure
              </h5>
              <ul className="space-y-0.5">
                {scene.treasure.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground">&bull; {stripCitations(item)}</li>
                ))}
              </ul>
            </div>
          )}

          {scene.mapSuggestion && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Map className="h-3 w-3 text-primary" />
                Map Suggestion
              </h5>
              <p className="text-xs text-muted-foreground">{stripCitations(scene.mapSuggestion)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Node Detail (for node-based adventures)
// ============================================================================

interface NodeDetailProps {
  node: AdventureNode;
  index: number;
  allNodes: AdventureNode[];
}

function NodeDetail({ node, index, allNodes }: NodeDetailProps) {
  const [expanded, setExpanded] = useState(index === 0);

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
    <div id={`detail-node-${node.id}`} className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
      >
        <Badge variant={nodeTypeBadge.variant} className="text-[10px]">
          {nodeTypeBadge.label}
        </Badge>
        {node.isEntryPoint && (
          <Star className="h-3 w-3 shrink-0 text-warning fill-warning" />
        )}
        <span className="text-sm font-medium text-foreground">{node.name}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {stripCitations(node.description)}
          </p>

          {node.readAloud && (
            <div className="rounded-md border-l-2 border-primary/50 bg-primary/5 px-3 py-2">
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                <BookOpen className="h-3 w-3" />
                Read Aloud
              </h5>
              <p className="text-sm italic text-foreground/90">{stripCitations(node.readAloud)}</p>
            </div>
          )}

          {/* Clues */}
          {node.clues.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Link className="h-3 w-3 text-primary" />
                Clues
              </h5>
              <div className="space-y-1.5">
                {node.clues.map((clue, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {clue.isHidden ? (
                      <EyeOff className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <Eye className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    )}
                    <div>
                      <span className="text-muted-foreground">{stripCitations(clue.description)}</span>
                      <span className="ml-1 text-primary">→ {resolveNodeName(clue.pointsTo)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {node.npcDialogue.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MessageSquare className="h-3 w-3 text-primary" />
                NPC Dialogue
              </h5>
              <div className="space-y-1.5">
                {node.npcDialogue.map((line, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-semibold text-primary">{line.npcName}</span>
                    <span className="text-muted-foreground"> ({line.context}): </span>
                    <span className="italic text-foreground">&ldquo;{stripCitations(line.dialogue)}&rdquo;</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {node.encounters.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Swords className="h-3 w-3 text-warning" />
                Encounters
              </h5>
              {node.encounters.map((enc, i) => (
                <div key={i} className="mt-1 rounded-md border border-border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{enc.name}</span>
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
                  <p className="text-xs text-muted-foreground">{stripCitations(enc.description)}</p>
                  {enc.creatures.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Creatures: {enc.creatures.map(stripCitations).join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {node.treasure.length > 0 && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Gem className="h-3 w-3 text-warning" />
                Treasure
              </h5>
              <ul className="space-y-0.5">
                {node.treasure.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground">&bull; {stripCitations(item)}</li>
                ))}
              </ul>
            </div>
          )}

          {node.mapSuggestion && (
            <div>
              <h5 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Map className="h-3 w-3 text-primary" />
                Map Suggestion
              </h5>
              <p className="text-xs text-muted-foreground">{stripCitations(node.mapSuggestion)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Markdown Export
// ============================================================================

function adventureToMarkdown(adventure: AdventureEntity): string {
  const s = stripCitations;
  const parts = [`# ${s(adventure.title)}`, "", s(adventure.synopsis), ""];
  if (adventure.estimatedDuration) {
    parts.push(`**Estimated Duration:** ${adventure.estimatedDuration}`, "");
  }

  // Node-based adventure
  if (adventure.front && adventure.nodes && adventure.nodes.length > 0) {
    parts.push("## The Situation", "");
    parts.push(s(adventure.front.description), "");
    parts.push(`**Stakes:** ${s(adventure.front.stakes)}`, "");

    if (adventure.front.keyFactions.length > 0) {
      parts.push("### Factions", "");
      for (const f of adventure.front.keyFactions) {
        parts.push(`- **${s(f.name)}**: ${s(f.goal)}`);
        parts.push(`  - Resources: ${s(f.resources)}`);
      }
      parts.push("");
    }

    if (adventure.doomTimeline && adventure.doomTimeline.length > 0) {
      parts.push("## Doom Timeline", "");
      for (const t of adventure.doomTimeline) {
        parts.push(`### ${t.stage}. ${s(t.label)}`, "");
        parts.push(s(t.event), "");
        parts.push(`*Consequence:* ${s(t.consequence)}`, "");
      }
    }

    parts.push("## Nodes", "");
    for (const node of adventure.nodes) {
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
          const target = adventure.nodes!.find((n) => n.id === clue.pointsTo);
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
        }
        parts.push("");
      }
      if (node.treasure.length > 0) {
        parts.push("**Treasure:**", "");
        node.treasure.forEach((t) => parts.push(`- ${s(t)}`));
        parts.push("");
      }
      if (node.mapSuggestion) {
        parts.push(`**Map:** ${s(node.mapSuggestion)}`, "");
      }
    }
  } else {
    // Legacy linear format
    for (const scene of adventure.scenes) {
      parts.push(`## Act ${scene.actNumber}: ${s(scene.title)}`, "", s(scene.description), "");
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
          if (enc.creatures.length > 0) parts.push(`  - Creatures: ${enc.creatures.map(s).join(", ")}`);
          if (enc.tactics) parts.push(`  - Tactics: ${s(enc.tactics)}`);
        }
        parts.push("");
      }
      if (scene.treasure.length > 0) {
        parts.push("**Treasure:**", "");
        scene.treasure.forEach((t) => parts.push(`- ${s(t)}`));
        parts.push("");
      }
      if (scene.mapSuggestion) {
        parts.push(`**Map:** ${s(scene.mapSuggestion)}`, "");
      }
    }
  }

  return parts.join("\n");
}

// ============================================================================
// Dialog Component
// ============================================================================

interface AdventureDetailDialogProps {
  adventure: AdventureEntity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (adventure: AdventureEntity) => void;
}

export function AdventureDetailDialog({
  adventure,
  open,
  onOpenChange,
  onDelete,
}: AdventureDetailDialogProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!adventure) return;
    const md = adventureToMarkdown(adventure);
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isNodeBased = adventure?.front && adventure.nodes && adventure.nodes.length > 0;

  return (
    <Dialog open={open && adventure !== null} onOpenChange={onOpenChange}>
      {adventure && (
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle className="text-xl">{adventure.title}</DialogTitle>
                <div className="mt-1 flex items-center gap-2">
                  {adventure.estimatedDuration && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {adventure.estimatedDuration}
                    </div>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {isNodeBased ? "Node-Based" : "Linear"}
                  </Badge>
                </div>
              </div>
              {adventure.isGenerated && (
                <Badge variant="secondary" className="shrink-0">
                  Generated
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Synopsis
              </h4>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {stripCitations(adventure.synopsis)}
              </p>
            </div>

            {isNodeBased ? (
              <>
                {/* Front / Situation */}
                <div className="rounded-md border border-border bg-card p-3">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-warning" />
                    The Situation
                  </h4>
                  <p className="text-sm text-foreground">
                    {stripCitations(adventure.front!.description)}
                  </p>
                  <div className="mt-2 rounded bg-destructive/10 px-2 py-1">
                    <p className="text-xs font-medium text-destructive">
                      Stakes: {stripCitations(adventure.front!.stakes)}
                    </p>
                  </div>
                  {adventure.front!.keyFactions.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {adventure.front!.keyFactions.map((f, i) => (
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
                {adventure.doomTimeline && adventure.doomTimeline.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nodes */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nodes ({adventure.nodes!.length})
                  </h4>
                  <div className="mt-2 space-y-2">
                    {adventure.nodes!.map((node, i) => (
                      <NodeDetail key={node.id} node={node} index={i} allNodes={adventure.nodes!} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Legacy linear scenes */
              adventure.scenes.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Scenes ({adventure.scenes.length})
                  </h4>
                  <div className="mt-2 space-y-2">
                    {adventure.scenes.map((scene, i) => (
                      <SceneDetail key={i} scene={scene} index={i} />
                    ))}
                  </div>
                </div>
              )
            )}

            <div className="flex flex-wrap gap-2">
              {adventure.npcs &&
                adventure.npcs.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      NPCs
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {adventure.npcs.map((npc, i) => (
                        <Badge key={i} variant="default" className="gap-1">
                          <Users className="h-3 w-3" />
                          {stripCitations(npc)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              {adventure.locations &&
                adventure.locations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Locations
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {adventure.locations.map((loc, i) => (
                        <Badge key={i} variant="success" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          {stripCitations(loc)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              {adventure.factions &&
                adventure.factions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Factions
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {adventure.factions.map((faction, i) => (
                        <Badge key={i} variant="warning" className="gap-1">
                          <Shield className="h-3 w-3" />
                          {stripCitations(faction)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {adventure.notes && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{adventure.notes}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Export Markdown
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => onDelete(adventure)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
