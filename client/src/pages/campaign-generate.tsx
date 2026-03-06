// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback, useEffect } from "react";
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
import {
  AdventureOutlineForm,
  type AdventureOutlineFormValues,
} from "@/components/generation/adventure-outline-form";
import { OutlineGenerationResult } from "@/components/generation/outline-generation-result";
import { useGenerateHooksStream } from "@/hooks/use-generation";
import { useGenerateNpcsStream } from "@/hooks/use-generate-npcs";
import { useGenerateLocationsStream } from "@/hooks/use-generate-locations";
import { useGenerateOutlinesStream } from "@/hooks/use-generate-outlines";
import { useCreateNpc } from "@/hooks/use-npcs";
import { useCreateLocation } from "@/hooks/use-locations";
import { useCreateAdventureHook } from "@/hooks/use-adventure-hooks";
import { useCreateAdventureOutline } from "@/hooks/use-adventure-outlines";
import type { GeneratedNpc, GeneratedLocation, GeneratedAdventureOutline, AdventureHook, AnswerSource } from "@/types";

const COMING_SOON_LABELS: Record<string, string> = {
  "full-adventures": "Full Adventures",
};

export function GeneratePage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [selectedType, setSelectedType] = useState<GenerationType>("adventure-hooks");

  // Restore persisted adventure hooks state from sessionStorage on mount
  const hooksStorageKey = campaignId ? `gm-assistant:gen-hooks-state:${campaignId}` : null;
  const [restoredHooksState] = useState(() => {
    if (!hooksStorageKey) return undefined;
    try {
      const raw = sessionStorage.getItem(hooksStorageKey);
      return raw ? (JSON.parse(raw) as { hooks: AdventureHook[]; sources: AnswerSource[] }) : undefined;
    } catch {
      return undefined;
    }
  });

  // Adventure hooks state
  const { generate, regenerateOne, hooks, sources, status, error, isStreaming } =
    useGenerateHooksStream(restoredHooksState);
  const [lastFormValues, setLastFormValues] = useState<AdventureHookFormValues | null>(() => {
    if (!hooksStorageKey) return null;
    try {
      const raw = sessionStorage.getItem(`${hooksStorageKey}:form`);
      return raw ? (JSON.parse(raw) as AdventureHookFormValues) : null;
    } catch {
      return null;
    }
  });
  const createAdventureHook = useCreateAdventureHook(campaignId ?? "");
  const [savingHookIndex, setSavingHookIndex] = useState<number | null>(null);

  // Persist generated hooks and sources to sessionStorage whenever they change
  useEffect(() => {
    if (!hooksStorageKey || hooks.length === 0) return;
    sessionStorage.setItem(hooksStorageKey, JSON.stringify({ hooks, sources }));
  }, [hooks, sources, hooksStorageKey]);

  // Persist last form values to sessionStorage whenever they change
  useEffect(() => {
    if (!hooksStorageKey || !lastFormValues) return;
    sessionStorage.setItem(`${hooksStorageKey}:form`, JSON.stringify(lastFormValues));
  }, [lastFormValues, hooksStorageKey]);

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

  // Adventure outline generation state
  const {
    generate: generateOutlines,
    regenerateOne: regenerateOneOutline,
    outlines: generatedOutlines,
    sources: outlineSources,
    status: outlineStatus,
    error: outlineError,
    isStreaming: outlineIsStreaming,
  } = useGenerateOutlinesStream();
  const createAdventureOutline = useCreateAdventureOutline(campaignId ?? "");
  const [savingOutlineIndex, setSavingOutlineIndex] = useState<number | null>(null);
  const [lastOutlineFormValues, setLastOutlineFormValues] = useState<AdventureOutlineFormValues | null>(null);

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

  const handleSaveHook = useCallback(
    async (hook: AdventureHook, index: number) => {
      if (!campaignId) return;
      setSavingHookIndex(index);
      try {
        await createAdventureHook.mutateAsync({
          title: hook.title,
          description: hook.description,
          npcs: hook.npcs.length > 0 ? hook.npcs : null,
          locations: hook.locations.length > 0 ? hook.locations : null,
          factions: hook.factions.length > 0 ? hook.factions : null,
          isGenerated: true,
        });
        toast.success("Hook saved to campaign");
      } catch {
        toast.error("Failed to save hook");
      } finally {
        setSavingHookIndex(null);
      }
    },
    [campaignId, createAdventureHook]
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

  // ---- Adventure Outline handlers ----

  const handleGenerateOutlines = useCallback(
    (values: AdventureOutlineFormValues) => {
      if (!campaignId) return;
      setLastOutlineFormValues(values);
      generateOutlines({
        campaignId,
        tone: values.tone,
        theme: values.theme,
        count: values.count,
        partyLevel: values.partyLevel,
        includeNpcsLocations: values.includeNpcsLocations,
      });
    },
    [campaignId, generateOutlines]
  );

  const handleRegenerateOutlines = useCallback(() => {
    if (lastOutlineFormValues) {
      handleGenerateOutlines(lastOutlineFormValues);
    }
  }, [lastOutlineFormValues, handleGenerateOutlines]);

  const handleRegenerateOneOutline = useCallback(
    (index: number) => {
      if (!campaignId || !lastOutlineFormValues) return;
      regenerateOneOutline(index, {
        campaignId,
        tone: lastOutlineFormValues.tone,
        theme: lastOutlineFormValues.theme,
        partyLevel: lastOutlineFormValues.partyLevel,
        includeNpcsLocations: lastOutlineFormValues.includeNpcsLocations,
      });
    },
    [campaignId, lastOutlineFormValues, regenerateOneOutline]
  );

  const handleSaveOutline = useCallback(
    async (outline: GeneratedAdventureOutline, index: number) => {
      if (!campaignId) return;
      setSavingOutlineIndex(index);
      try {
        await createAdventureOutline.mutateAsync({
          title: outline.title,
          description: outline.description,
          acts: outline.acts,
          npcs: outline.npcs.length > 0 ? outline.npcs : null,
          locations: outline.locations.length > 0 ? outline.locations : null,
          factions: outline.factions.length > 0 ? outline.factions : null,
          isGenerated: true,
        });
        toast.success("Outline saved to campaign");
      } catch {
        toast.error("Failed to save outline");
      } finally {
        setSavingOutlineIndex(null);
      }
    },
    [campaignId, createAdventureOutline]
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
            savingIndex={savingHookIndex}
            onRegenerate={handleRegenerate}
            onRegenerateOne={handleRegenerateOne}
            onSave={handleSaveHook}
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
      ) : selectedType === "adventure-outlines" ? (
        <div className="space-y-6">
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              Generate Adventure Outlines
            </h3>
            <AdventureOutlineForm
              onSubmit={handleGenerateOutlines}
              isLoading={outlineIsStreaming}
            />
          </div>

          <OutlineGenerationResult
            outlines={generatedOutlines}
            sources={outlineSources}
            status={outlineStatus}
            error={outlineError}
            isStreaming={outlineIsStreaming}
            savingIndex={savingOutlineIndex}
            onRegenerate={handleRegenerateOutlines}
            onRegenerateOne={handleRegenerateOneOutline}
            onSave={handleSaveOutline}
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
