// SPDX-License-Identifier: AGPL-3.0-or-later

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { OutlineCard } from "./outline-card";
import type { GeneratedAdventureOutline, AnswerSource } from "@/types";

interface OutlineGenerationResultProps {
  outlines: GeneratedAdventureOutline[];
  sources: AnswerSource[];
  status: string | null;
  error: Error | null;
  isStreaming: boolean;
  savingIndex: number | null;
  onRegenerate: () => void;
  onRegenerateOne?: (index: number) => void;
  onSave: (outline: GeneratedAdventureOutline, index: number) => void;
}

export function OutlineGenerationResult({
  outlines,
  sources,
  status,
  error,
  isStreaming,
  savingIndex,
  onRegenerate,
  onRegenerateOne,
  onSave,
}: OutlineGenerationResultProps) {
  if (error) {
    return (
      <ErrorState
        heading="Generation failed"
        description={error.message}
        onRetry={onRegenerate}
        retryLabel="Try again"
      />
    );
  }

  if (outlines.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">Generated Outlines</h3>
          {isStreaming && <Spinner className="h-4 w-4" label="Generating outlines" />}
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
        {!isStreaming && outlines.length > 0 && (
          <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate All
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {outlines.map((outline, index) => (
          <OutlineCard
            key={index}
            outline={outline}
            index={index}
            isSaving={savingIndex === index}
            onSave={onSave}
            onRegenerateOne={onRegenerateOne}
            isStreaming={isStreaming}
            sources={sources}
          />
        ))}
      </div>

      {!isStreaming && sources.length > 0 && (
        <div className="rounded-[var(--radius)] border border-border bg-secondary/50 p-4">
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">
            Sources ({sources.length})
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
