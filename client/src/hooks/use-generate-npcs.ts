// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  GenerateNpcsRequest,
  NpcGenerationSSEEvent,
  GeneratedNpc,
  AnswerSource,
} from "@/types";

interface GenerateNpcsParams extends GenerateNpcsRequest {
  campaignId: string;
}

export function useGenerateNpcsStream() {
  const [npcs, setNpcs] = useState<GeneratedNpc[]>([]);
  const [sources, setSources] = useState<AnswerSource[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);

  const generate = useCallback(async ({ campaignId, ...body }: GenerateNpcsParams) => {
    setIsStreaming(true);
    setError(null);
    setNpcs([]);
    setSources([]);
    setStatus(null);
    abortRef.current = false;

    try {
      const stream = api.stream<NpcGenerationSSEEvent>(
        `/api/campaigns/${campaignId}/generate/npcs`,
        body
      );

      for await (const event of stream) {
        if (abortRef.current) break;

        switch (event.type) {
          case "status":
            setStatus(event.message);
            break;
          case "npc":
            setNpcs((prev) => [...prev, event.npc]);
            break;
          case "complete":
            setSources(event.sources);
            break;
          case "error":
            setError(new Error(event.message));
            break;
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Generation failed");
      setError(err);
    } finally {
      setIsStreaming(false);
      setStatus(null);
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { generate, abort, npcs, sources, status, error, isStreaming };
}
