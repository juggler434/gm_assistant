import { HooksList } from "./hooks-list";
import type { AdventureHook, AnswerSource } from "@/types";

interface GenerationResultProps {
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

export function GenerationResult({
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
}: GenerationResultProps) {
  return (
    <HooksList
      hooks={hooks}
      sources={sources}
      status={status}
      error={error}
      isStreaming={isStreaming}
      savedHooks={savedHooks}
      onRegenerate={onRegenerate}
      onRegenerateOne={onRegenerateOne}
      onSave={onSave}
      onUnsave={onUnsave}
    />
  );
}
