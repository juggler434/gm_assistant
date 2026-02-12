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
import { useGenerateHooksStream } from "@/hooks/use-generation";
import { useSavedHooks } from "@/hooks/use-saved-hooks";

const COMING_SOON_LABELS: Record<string, string> = {
  "adventure-outlines": "Adventure Outlines",
  "full-adventures": "Full Adventures",
  npcs: "NPCs",
  locations: "Locations",
};

export function GeneratePage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [selectedType, setSelectedType] = useState<GenerationType>("adventure-hooks");
  const { generate, regenerateOne, hooks, sources, status, error, isStreaming } =
    useGenerateHooksStream();
  const [lastFormValues, setLastFormValues] = useState<AdventureHookFormValues | null>(null);
  const { savedHooks, saveHook, unsaveHook } = useSavedHooks(campaignId ?? "");

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
