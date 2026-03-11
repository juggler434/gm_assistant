// SPDX-License-Identifier: AGPL-3.0-or-later

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { GenerationType } from "@/components/generation/generation-type-selector";
import type { AdventureHookFormValues } from "@/components/generation/adventure-hook-form";
import type { NpcGenerationFormValues } from "@/components/generation/npc-generation-form";
import type { LocationGenerationFormValues } from "@/components/generation/location-generation-form";
import type { AdventureOutlineFormValues } from "@/components/generation/adventure-outline-form";
import type { AdventureFormValues } from "@/components/generation/adventure-form";
import { useGenerateHooksStream } from "@/hooks/use-generation";
import { useGenerateNpcsStream } from "@/hooks/use-generate-npcs";
import { useGenerateLocationsStream } from "@/hooks/use-generate-locations";
import { useGenerateOutlinesStream } from "@/hooks/use-generate-outlines";
import { useGenerateAdventureStream } from "@/hooks/use-generate-adventures";

/**
 * Generation context — lives at the CampaignLayout level so streaming state
 * (spinners, partial results, completed results) survives navigation between
 * campaign sub-pages.
 */

interface GenerationContextValue {
  selectedType: GenerationType;
  setSelectedType: (type: GenerationType) => void;

  // Streaming hooks (state + generate/abort functions)
  hooksStream: ReturnType<typeof useGenerateHooksStream>;
  npcsStream: ReturnType<typeof useGenerateNpcsStream>;
  locationsStream: ReturnType<typeof useGenerateLocationsStream>;
  outlinesStream: ReturnType<typeof useGenerateOutlinesStream>;
  adventuresStream: ReturnType<typeof useGenerateAdventureStream>;

  // Last form values for regenerate support
  hooksFormValues: AdventureHookFormValues | null;
  setHooksFormValues: (v: AdventureHookFormValues | null) => void;
  npcsFormValues: NpcGenerationFormValues | null;
  setNpcsFormValues: (v: NpcGenerationFormValues | null) => void;
  locationsFormValues: LocationGenerationFormValues | null;
  setLocationsFormValues: (v: LocationGenerationFormValues | null) => void;
  outlinesFormValues: AdventureOutlineFormValues | null;
  setOutlinesFormValues: (v: AdventureOutlineFormValues | null) => void;
  adventuresFormValues: AdventureFormValues | null;
  setAdventuresFormValues: (v: AdventureFormValues | null) => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [selectedType, setSelectedType] = useState<GenerationType>("adventure-hooks");

  // Streaming hooks — created once, persist for the lifetime of the campaign layout
  const hooksStream = useGenerateHooksStream();
  const npcsStream = useGenerateNpcsStream();
  const locationsStream = useGenerateLocationsStream();
  const outlinesStream = useGenerateOutlinesStream();
  const adventuresStream = useGenerateAdventureStream();

  // Form values for regenerate
  const [hooksFormValues, setHooksFormValues] = useState<AdventureHookFormValues | null>(null);
  const [npcsFormValues, setNpcsFormValues] = useState<NpcGenerationFormValues | null>(null);
  const [locationsFormValues, setLocationsFormValues] = useState<LocationGenerationFormValues | null>(null);
  const [outlinesFormValues, setOutlinesFormValues] = useState<AdventureOutlineFormValues | null>(null);
  const [adventuresFormValues, setAdventuresFormValues] = useState<AdventureFormValues | null>(null);

  return (
    <GenerationContext.Provider
      value={{
        selectedType,
        setSelectedType,
        hooksStream,
        npcsStream,
        locationsStream,
        outlinesStream,
        adventuresStream,
        hooksFormValues,
        setHooksFormValues,
        npcsFormValues,
        setNpcsFormValues,
        locationsFormValues,
        setLocationsFormValues,
        outlinesFormValues,
        setOutlinesFormValues,
        adventuresFormValues,
        setAdventuresFormValues,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}

export function useGenerationContext(): GenerationContextValue {
  const ctx = useContext(GenerationContext);
  if (!ctx) {
    throw new Error("useGenerationContext must be used within a GenerationProvider");
  }
  return ctx;
}
