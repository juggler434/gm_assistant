// SPDX-License-Identifier: AGPL-3.0-or-later

import { FileText } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { GeneratedNpcCard } from "./generated-npc-card";
import type { GeneratedNpc, AnswerSource } from "@/types";

interface NpcGenerationResultProps {
  npcs: GeneratedNpc[];
  sources: AnswerSource[];
  status: string | null;
  error: Error | null;
  isStreaming: boolean;
  savingIndex: number | null;
  onSave: (npc: GeneratedNpc, index: number) => void;
}

export function NpcGenerationResult({
  npcs,
  sources,
  status,
  error,
  isStreaming,
  savingIndex,
  onSave,
}: NpcGenerationResultProps) {
  if (npcs.length === 0 && !isStreaming && !error) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Status indicator */}
      {isStreaming && status && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          {status}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error.message}</p>
        </div>
      )}

      {/* Generated NPCs */}
      {npcs.length > 0 && (
        <div className="space-y-4">
          {npcs.map((npc, index) => (
            <GeneratedNpcCard
              key={`${npc.name}-${index}`}
              npc={npc}
              onSave={(n) => onSave(n, index)}
              isSaving={savingIndex === index}
            />
          ))}
        </div>
      )}

      {/* Streaming indicator */}
      {isStreaming && npcs.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Generating more NPCs...
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && !isStreaming && (
        <div className="rounded-md border border-border bg-card p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Setting Sources Used
          </h4>
          <div className="flex flex-wrap gap-2">
            {sources.map((source, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-xs">
                <FileText className="h-3 w-3" />
                {source.documentName}
                {source.pageNumber !== null && ` (p. ${source.pageNumber})`}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
