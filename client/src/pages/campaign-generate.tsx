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
import {
  LocationGenerationForm,
  type LocationGenerationFormValues,
} from "@/components/generation/location-generation-form";
import { LocationGenerationResult } from "@/components/generation/location-generation-result";
import { useGenerateHooksStream } from "@/hooks/use-generation";
import { useGenerateNpcsStream } from "@/hooks/use-generate-npcs";
import { useGenerateLocationsStream } from "@/hooks/use-generate-locations";
import { useCreateNpc } from "@/hooks/use-npcs";
import { useCreateLocation } from "@/hooks/use-locations";
import { useSavedHooks } from "@/hooks/use-saved-hooks";
import type { GeneratedNpc, GeneratedLocation } from "@/types";

const COMING_SOON_LABELS: Record<string, string> = {
  "adventure-outlines": "Adventure Outlines",
  "full-adventures": "Full Adventures",
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
  const [lastNpcFormValues, setLastNpcFormValues] = useState<NpcGenerationFormValues | null>(null);

  // Location generation state
  const {
    generate: generateLocs,
    locations: generatedLocations,
    sources: locationSources,
    status: locationStatus,
    error: locationError,
    isStreaming: locationIsStreaming,
  } = useGenerateLocationsStream();
  const createLocation = useCreateLocation(campaignId ?? "");
  const [savingLocationIndex, setSavingLocationIndex] = useState<number | null>(null);

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
      setLastNpcFormValues(values);
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
          importance: lastNpcFormValues?.importance ?? "minor",
          isGenerated: true,
        });
        toast.success(`${npc.name} saved to campaign`);
      } catch {
        toast.error("Failed to save NPC");
      } finally {
        setSavingNpcIndex(null);
      }
    },
    [campaignId, createNpc, lastNpcFormValues]
  );

  // ---- Location Generation handlers ----

  const handleGenerateLocations = useCallback(
    (values: LocationGenerationFormValues) => {
      if (!campaignId) return;
      generateLocs({
        campaignId,
        tone: values.tone,
        terrain: values.terrain,
        climate: values.climate,
        size: values.size,
        count: values.count,
        constraints: values.constraints,
      });
    },
    [campaignId, generateLocs]
  );

  const handleSaveLocation = useCallback(
    async (location: GeneratedLocation, index: number) => {
      if (!campaignId) return;
      setSavingLocationIndex(index);
      try {
        await createLocation.mutateAsync({
          name: location.name,
          terrain: location.terrain || null,
          climate: location.climate || null,
          size: location.size || null,
          readAloud: location.readAloud || null,
          keyFeatures: location.keyFeatures,
          pointsOfInterest: location.pointsOfInterest,
          encounters: location.encounters,
          secrets: location.secrets,
          npcsPresent: location.npcsPresent,
          factions: location.factions,
          sensoryDetails: location.sensoryDetails,
          tags: null,
          isGenerated: true,
        });
        toast.success(`${location.name} saved to campaign`);
      } catch {
        toast.error("Failed to save location");
      } finally {
        setSavingLocationIndex(null);
      }
    },
    [campaignId, createLocation]
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
            <h3 className="mb-4 text-base font-semibold text-foreground">Generate NPCs</h3>
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
      ) : selectedType === "locations" ? (
        <div className="space-y-6">
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold text-foreground">Generate Locations</h3>
            <LocationGenerationForm
              onSubmit={handleGenerateLocations}
              isLoading={locationIsStreaming}
            />
          </div>

          <LocationGenerationResult
            locations={generatedLocations}
            sources={locationSources}
            status={locationStatus}
            error={locationError}
            isStreaming={locationIsStreaming}
            savingIndex={savingLocationIndex}
            onSave={handleSaveLocation}
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
