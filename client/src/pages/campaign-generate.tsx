// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { GenerationTypeSelector } from "@/components/generation/generation-type-selector";
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
import {
  AdventureForm,
  type AdventureFormValues,
} from "@/components/generation/adventure-form";
import { AdventureGenerationResult } from "@/components/generation/adventure-generation-result";
import { useGenerationContext } from "@/hooks/use-generation-context";
import { useCreateNpc } from "@/hooks/use-npcs";
import { useCreateLocation } from "@/hooks/use-locations";
import { useCreateAdventureHook } from "@/hooks/use-adventure-hooks";
import { useCreateAdventureOutline } from "@/hooks/use-adventure-outlines";
import { useAdventureOutlines } from "@/hooks/use-adventure-outlines";
import { useCreateAdventure } from "@/hooks/use-adventures";
import type { GeneratedNpc, GeneratedLocation, GeneratedAdventureOutline, GeneratedAdventure, AdventureHook } from "@/types";

export function GeneratePage() {
  const { id: campaignId } = useParams<{ id: string }>();

  // Pull all streaming state from the layout-level context so it survives navigation
  const {
    selectedType,
    setSelectedType,
    hooksStream,
    npcsStream,
    locationsStream,
    outlinesStream,
    adventuresStream,
    hooksFormValues: lastFormValues,
    setHooksFormValues: setLastFormValues,
    npcsFormValues: lastNpcFormValues,
    setNpcsFormValues: setLastNpcFormValues,
    outlinesFormValues: lastOutlineFormValues,
    setOutlinesFormValues: setLastOutlineFormValues,
    adventuresFormValues: lastAdventureFormValues,
    setAdventuresFormValues: setLastAdventureFormValues,
  } = useGenerationContext();

  // Destructure streaming hooks
  const { generate, regenerateOne, hooks, sources, status, error, isStreaming } = hooksStream;
  const {
    generate: generateNpcs,
    npcs: generatedNpcs,
    sources: npcSources,
    status: npcStatus,
    error: npcError,
    isStreaming: npcIsStreaming,
  } = npcsStream;
  const {
    generate: generateLocs,
    locations: generatedLocations,
    sources: locationSources,
    status: locationStatus,
    error: locationError,
    isStreaming: locationIsStreaming,
  } = locationsStream;
  const {
    generate: generateOutlines,
    regenerateOne: regenerateOneOutline,
    outlines: generatedOutlines,
    sources: outlineSources,
    status: outlineStatus,
    error: outlineError,
    isStreaming: outlineIsStreaming,
  } = outlinesStream;
  const {
    generate: generateAdventure,
    adventure: generatedAdventure,
    sources: adventureSources,
    status: adventureStatus,
    error: adventureError,
    isStreaming: adventureIsStreaming,
  } = adventuresStream;

  // Save-in-progress indicators (page-local, no need to persist across nav)
  const createAdventureHook = useCreateAdventureHook(campaignId ?? "");
  const [savingHookIndex, setSavingHookIndex] = useState<number | null>(null);

  const createNpc = useCreateNpc(campaignId ?? "");
  const [savingNpcIndex, setSavingNpcIndex] = useState<number | null>(null);

  const createLocation = useCreateLocation(campaignId ?? "");
  const [savingLocationIndex, setSavingLocationIndex] = useState<number | null>(null);

  const createAdventureOutline = useCreateAdventureOutline(campaignId ?? "");
  const [savingOutlineIndex, setSavingOutlineIndex] = useState<number | null>(null);

  const createAdventure = useCreateAdventure(campaignId ?? "");
  const [savingAdventure, setSavingAdventure] = useState(false);

  // Fetch outlines for the adventure form's "expand from outline" dropdown
  const { data: outlinesList } = useAdventureOutlines(campaignId ?? "");

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
    [campaignId, generate, setLastFormValues]
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
    [campaignId, generateNpcs, setLastNpcFormValues]
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
    [campaignId, generateOutlines, setLastOutlineFormValues]
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

  // ---- Full Adventure handlers ----

  const handleGenerateAdventure = useCallback(
    (values: AdventureFormValues) => {
      if (!campaignId) return;
      setLastAdventureFormValues(values);
      generateAdventure({
        campaignId,
        tone: values.tone,
        theme: values.theme,
        partyLevel: values.partyLevel,
        sourceOutlineId: values.sourceOutlineId,
        includeStatBlocks: values.includeStatBlocks,
      });
    },
    [campaignId, generateAdventure, setLastAdventureFormValues]
  );

  const handleRegenerateAdventure = useCallback(() => {
    if (lastAdventureFormValues) {
      handleGenerateAdventure(lastAdventureFormValues);
    }
  }, [lastAdventureFormValues, handleGenerateAdventure]);

  const handleSaveAdventure = useCallback(
    async (adventure: GeneratedAdventure) => {
      if (!campaignId) return;
      setSavingAdventure(true);
      try {
        await createAdventure.mutateAsync({
          title: adventure.title,
          synopsis: adventure.synopsis,
          estimatedDuration: adventure.estimatedDuration || null,
          scenes: adventure.scenes,
          npcs: adventure.npcs.length > 0 ? adventure.npcs : null,
          locations: adventure.locations.length > 0 ? adventure.locations : null,
          factions: adventure.factions.length > 0 ? adventure.factions : null,
          isGenerated: true,
          sourceOutlineId: lastAdventureFormValues?.sourceOutlineId ?? null,
        });
        toast.success("Adventure saved to campaign");
      } catch {
        toast.error("Failed to save adventure");
      } finally {
        setSavingAdventure(false);
      }
    },
    [campaignId, createAdventure, lastAdventureFormValues]
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
      ) : selectedType === "full-adventures" ? (
        <div className="space-y-6">
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              Generate Full Adventure
            </h3>
            <AdventureForm
              onSubmit={handleGenerateAdventure}
              isLoading={adventureIsStreaming}
              outlines={outlinesList?.map((o) => ({ id: o.id, title: o.title })) ?? []}
            />
          </div>

          <AdventureGenerationResult
            adventure={generatedAdventure}
            sources={adventureSources}
            status={adventureStatus}
            error={adventureError}
            isStreaming={adventureIsStreaming}
            isSaving={savingAdventure}
            onRegenerate={handleRegenerateAdventure}
            onSave={handleSaveAdventure}
          />
        </div>
      ) : null}
    </div>
  );
}
