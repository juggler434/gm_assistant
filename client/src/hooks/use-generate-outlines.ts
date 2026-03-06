// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  GenerateOutlinesRequest,
  OutlineGenerationSSEEvent,
  GeneratedAdventureOutline,
  AnswerSource,
} from "@/types";

interface GenerateOutlinesParams extends GenerateOutlinesRequest {
  campaignId: string;
}

/**
 * Streaming hook for adventure outline generation via SSE.
 * Yields outlines incrementally as they are generated.
 */
export function useGenerateOutlinesStream(initialState?: {
  outlines?: GeneratedAdventureOutline[];
  sources?: AnswerSource[];
}) {
  const [outlines, setOutlines] = useState<GeneratedAdventureOutline[]>(initialState?.outlines ?? []);
  const [sources, setSources] = useState<AnswerSource[]>(initialState?.sources ?? []);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);

  const generate = useCallback(async ({ campaignId, ...body }: GenerateOutlinesParams) => {
    setIsStreaming(true);
    setError(null);
    setOutlines([]);
    setSources([]);
    setStatus(null);
    abortRef.current = false;

    try {
      const stream = api.stream<OutlineGenerationSSEEvent>(
        `/api/campaigns/${campaignId}/generate/outlines`,
        body
      );

      for await (const event of stream) {
        if (abortRef.current) break;

        switch (event.type) {
          case "status":
            setStatus(event.message);
            break;
          case "outline":
            setOutlines((prev) => [...prev, event.outline]);
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

  const regenerateOne = useCallback(async (index: number, params: GenerateOutlinesParams) => {
    setIsStreaming(true);
    setError(null);
    setStatus(null);
    abortRef.current = false;

    try {
      const stream = api.stream<OutlineGenerationSSEEvent>(
        `/api/campaigns/${params.campaignId}/generate/outlines`,
        { ...params, count: 1 }
      );

      for await (const event of stream) {
        if (abortRef.current) break;

        switch (event.type) {
          case "status":
            setStatus(event.message);
            break;
          case "outline":
            setOutlines((prev) => {
              const updated = [...prev];
              updated[index] = event.outline;
              return updated;
            });
            break;
          case "complete":
            break;
          case "error":
            setError(new Error(event.message));
            break;
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Regeneration failed");
      setError(err);
    } finally {
      setIsStreaming(false);
      setStatus(null);
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { generate, regenerateOne, abort, outlines, sources, status, error, isStreaming };
}
