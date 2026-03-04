// SPDX-License-Identifier: AGPL-3.0-or-later

import { Spinner } from "@/components/ui/spinner";
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
              sources={sources}
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
          <ul className="space-y-1">
            {sources.map((source, i) => {
              const idx = source.index ?? i + 1;
              return (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium text-primary">[{idx}]</span>{" "}
                  {source.documentName}
                  {source.section && <span className="ml-1 opacity-70">- {source.section}</span>}
                  {source.pageNumber !== null && (
                    <span className="ml-1 opacity-70">(p. {source.pageNumber})</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
