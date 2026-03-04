// SPDX-License-Identifier: AGPL-3.0-or-later

import { HooksList } from "./hooks-list";
import type { AdventureHook, AnswerSource } from "@/types";

interface GenerationResultProps {
  hooks: AdventureHook[];
  sources: AnswerSource[];
  status: string | null;
  error: Error | null;
  isStreaming: boolean;
  savingIndex: number | null;
  onRegenerate: () => void;
  onRegenerateOne?: (index: number) => void;
  onSave: (hook: AdventureHook, index: number) => void;
}

export function GenerationResult({
  hooks,
  sources,
  status,
  error,
  isStreaming,
  savingIndex,
  onRegenerate,
  onRegenerateOne,
  onSave,
}: GenerationResultProps) {
  return (
    <HooksList
      hooks={hooks}
      sources={sources}
      status={status}
      error={error}
      isStreaming={isStreaming}
      savingIndex={savingIndex}
      onRegenerate={onRegenerate}
      onRegenerateOne={onRegenerateOne}
      onSave={onSave}
    />
  );
}
