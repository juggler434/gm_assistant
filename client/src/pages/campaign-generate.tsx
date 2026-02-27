// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  GenerationTypeSelector,
  type GenerationType,
} from "@/components/generation/generation-type-selector";
import {
  AdventureHookForm,
  type AdventureHookFormValues,
} from "@/components/generation/adventure-hook-form";
import { GenerationResult } from "@/components/generation/generation-result";
import {
  NpcGenerationForm,
  type NpcGenerationFormValues,
} from "@/components/generation/npc-generation-form";
import { NpcGenerationResult } from "@/components/generation/npc-generation-result";
import { useGenerateHooksStream } from "@/hooks/use-generation";
import { useGenerateNpcsStream } from "@/hooks/use-generate-npcs";
import { useCreateNpc } from "@/hooks/use-npcs";
import { useSavedHooks } from "@/hooks/use-saved-hooks";
import type { GeneratedNpc } from "@/types";

const COMING_SOON_LABELS: Record<string, string> = {
  "adventure-outlines": "Adventure Outlines",
  "full-adventures": "Full Adventures",
  locations: "Locations",
};

export function GeneratePage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [selectedType, setSelectedType] = useState<GenerationType>("adventure-hooks");

  // Adventure hooks state
  const { generate, regenerateOne, hooks, sources, status, error, isStreaming } =
    useGenerateHooksStream();
  const [lastFormValues, setLastFormValues] = useState<AdventureHookFormValues | null>(null);
  const { savedHooks, saveHook, unsaveHook } = useSavedHooks(campaignId ?? "");

  // NPC generation state
  const {
    generate: generateNpcs,
    npcs: generatedNpcs,
    sources: npcSources,
    status: npcStatus,
    error: npcError,
    isStreaming: npcIsStreaming,
  } = useGenerateNpcsStream();
  const createNpc = useCreateNpc(campaignId ?? "");
  const [savingNpcIndex, setSavingNpcIndex] = useState<number | null>(null);

  // ---- Adventure Hooks handlers ----

  const handleGenerate = useCallback(
    (values: AdventureHookFormValues) => {
      if (!campaignId) return;
      setLastFormValues(values);
      generate({
        campaignId,
        tone: values.tone,
        theme: values.theme,
        count: values.count,
        partyLevel: values.partyLevel,
        includeNpcsLocations: values.includeNpcsLocations,
      });
    },
    [campaignId, generate]
  );

  const handleRegenerate = useCallback(() => {
    if (lastFormValues) {
      handleGenerate(lastFormValues);
    }
  }, [lastFormValues, handleGenerate]);

  const handleRegenerateOne = useCallback(
    (index: number) => {
      if (!campaignId || !lastFormValues) return;
      regenerateOne(index, {
        campaignId,
        tone: lastFormValues.tone,
        theme: lastFormValues.theme,
        partyLevel: lastFormValues.partyLevel,
        includeNpcsLocations: lastFormValues.includeNpcsLocations,
      });
    },
    [campaignId, lastFormValues, regenerateOne]
  );

  const handleSave = useCallback(
    (hook: Parameters<typeof saveHook>[0]) => {
      saveHook(hook);
      toast.success("Hook saved");
    },
    [saveHook]
  );

  const handleUnsave = useCallback(
    (hook: Parameters<typeof unsaveHook>[0]) => {
      unsaveHook(hook);
      toast.success("Hook removed from saved");
    },
    [unsaveHook]
  );

  // ---- NPC Generation handlers ----

  const handleGenerateNpcs = useCallback(
    (values: NpcGenerationFormValues) => {
      if (!campaignId) return;
      generateNpcs({
        campaignId,
        tone: values.tone,
        race: values.race,
        classRole: values.classRole,
        level: values.level,
        importance: values.importance,
        count: values.count,
        includeStatBlock: values.includeStatBlock,
        constraints: values.constraints,
      });
    },
    [campaignId, generateNpcs]
  );

  const handleSaveNpc = useCallback(
    async (npc: GeneratedNpc, index: number) => {
      if (!campaignId) return;
      setSavingNpcIndex(index);
      try {
        await createNpc.mutateAsync({
          name: npc.name,
          race: npc.race || null,
          classRole: npc.classRole || null,
          level: npc.level || null,
          appearance: npc.appearance || null,
          personality: npc.personality || null,
          motivations: npc.motivations || null,
          secrets: npc.secrets || null,
          backstory: npc.backstory || null,
          statBlock: npc.statBlock,
          isGenerated: true,
        });
        toast.success(`${npc.name} saved to campaign`);
      } catch {
        toast.error("Failed to save NPC");
      } finally {
        setSavingNpcIndex(null);
      }
    },
    [campaignId, createNpc]
  );

  return (
    <div className="space-y-6">
      <GenerationTypeSelector selected={selectedType} onSelect={setSelectedType} />

      {selectedType === "adventure-hooks" ? (
        <div className="space-y-6">
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              Generate Adventure Hooks
            </h3>
            <AdventureHookForm onSubmit={handleGenerate} isLoading={isStreaming} />
          </div>

          <GenerationResult
            hooks={hooks}
            sources={sources}
            status={status}
            error={error}
            isStreaming={isStreaming}
            savedHooks={savedHooks}
            onRegenerate={handleRegenerate}
            onRegenerateOne={handleRegenerateOne}
            onSave={handleSave}
            onUnsave={handleUnsave}
          />
        </div>
      ) : selectedType === "npcs" ? (
        <div className="space-y-6">
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              Generate NPCs
            </h3>
            <NpcGenerationForm onSubmit={handleGenerateNpcs} isLoading={npcIsStreaming} />
          </div>

          <NpcGenerationResult
            npcs={generatedNpcs}
            sources={npcSources}
            status={npcStatus}
            error={npcError}
            isStreaming={npcIsStreaming}
            savingIndex={savingNpcIndex}
            onSave={handleSaveNpc}
          />
        </div>
      ) : (
        <EmptyState
          icon={<Lock />}
          heading={`${COMING_SOON_LABELS[selectedType]} - Coming Soon`}
          description="This generation type is not yet available. Check back later for updates."
        />
      )}
    </div>
  );
}
