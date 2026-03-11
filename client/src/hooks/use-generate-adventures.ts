// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  GenerateAdventureRequest,
  AdventureGenerationSSEEvent,
  GeneratedAdventure,
  AnswerSource,
} from "@/types";

interface GenerateAdventureParams extends GenerateAdventureRequest {
  campaignId: string;
}

/**
 * Streaming hook for full adventure generation via SSE.
 * Yields the adventure once it is fully generated.
 */
export function useGenerateAdventureStream() {
  const [adventure, setAdventure] = useState<GeneratedAdventure | null>(null);
  const [sources, setSources] = useState<AnswerSource[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);

  const generate = useCallback(async ({ campaignId, ...body }: GenerateAdventureParams) => {
    setIsStreaming(true);
    setError(null);
    setAdventure(null);
    setSources([]);
    setStatus(null);
    abortRef.current = false;

    try {
      const stream = api.stream<AdventureGenerationSSEEvent>(
        `/api/campaigns/${campaignId}/generate/adventures`,
        body
      );

      for await (const event of stream) {
        if (abortRef.current) break;

        switch (event.type) {
          case "status":
            setStatus(event.message);
            break;
          case "adventure":
            setAdventure(event.adventure);
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

  return { generate, abort, adventure, sources, status, error, isStreaming };
}
