import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { HookCard } from "./hook-card";
import type { AdventureHook, AnswerSource } from "@/types";

interface HooksListProps {
  hooks: AdventureHook[];
  sources: AnswerSource[];
  status: string | null;
  error: Error | null;
  isStreaming: boolean;
  savedHooks: AdventureHook[];
  onRegenerate: () => void;
  onRegenerateOne?: (index: number) => void;
  onSave: (hook: AdventureHook) => void;
  onUnsave: (hook: AdventureHook) => void;
}

export function HooksList({
  hooks,
  sources,
  status,
  error,
  isStreaming,
  savedHooks,
  onRegenerate,
  onRegenerateOne,
  onSave,
  onUnsave,
}: HooksListProps) {
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

  if (hooks.length === 0 && !isStreaming) {
    return null;
  }

  function isHookSaved(hook: AdventureHook): boolean {
    return savedHooks.some((s) => s.title === hook.title && s.description === hook.description);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">Generated Hooks</h3>
          {isStreaming && <Spinner className="h-4 w-4" label="Generating hooks" />}
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
        {!isStreaming && hooks.length > 0 && (
          <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate All
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {hooks.map((hook, index) => (
          <HookCard
            key={index}
            hook={hook}
            index={index}
            isSaved={isHookSaved(hook)}
            onSave={onSave}
            onUnsave={onUnsave}
            onRegenerateOne={onRegenerateOne}
            isStreaming={isStreaming}
          />
        ))}
      </div>

      {!isStreaming && sources.length > 0 && (
        <div className="rounded-[var(--radius)] border border-border bg-secondary/50 p-4">
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">
            Sources ({sources.length})
          </h4>
          <ul className="space-y-1">
            {sources.map((source, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {source.documentName}
                {source.section && <span className="ml-1 opacity-70">- {source.section}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
