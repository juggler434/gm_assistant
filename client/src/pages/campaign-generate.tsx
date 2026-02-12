import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Lock } from "lucide-react";
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

const COMING_SOON_LABELS: Record<string, string> = {
  "adventure-outlines": "Adventure Outlines",
  "full-adventures": "Full Adventures",
  npcs: "NPCs",
  locations: "Locations",
};

export function GeneratePage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [selectedType, setSelectedType] = useState<GenerationType>("adventure-hooks");
  const { generate, hooks, sources, status, error, isStreaming } = useGenerateHooksStream();
  const [lastFormValues, setLastFormValues] = useState<AdventureHookFormValues | null>(null);

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
      });
    },
    [campaignId, generate]
  );

  const handleRegenerate = useCallback(() => {
    if (lastFormValues) {
      handleGenerate(lastFormValues);
    }
  }, [lastFormValues, handleGenerate]);

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
            onRegenerate={handleRegenerate}
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
