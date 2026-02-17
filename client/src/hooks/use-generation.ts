// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  GenerateHooksRequest,
  GenerateHooksResponse,
  GenerationSSEEvent,
  AdventureHook,
  AnswerSource,
} from "@/types";

interface GenerateHooksParams extends GenerateHooksRequest {
  campaignId: string;
}

/**
 * Non-streaming mutation for adventure hook generation.
 * Returns the full response once generation is complete.
 */
export function useGenerateHooks() {
  const [data, setData] = useState<GenerateHooksResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(async ({ campaignId, ...body }: GenerateHooksParams) => {
    setIsPending(true);
    setError(null);
    setData(null);
    try {
      const result = await api.post<GenerateHooksResponse>(
        `/api/campaigns/${campaignId}/generate/hooks`,
        body
      );
      setData(result);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Generation failed");
      setError(err);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutate, data, error, isPending };
}

/**
 * Streaming hook for adventure hook generation via SSE.
 * Yields hooks incrementally as they are generated.
 * Supports regenerating individual hooks at a specific index.
 */
export function useGenerateHooksStream() {
  const [hooks, setHooks] = useState<AdventureHook[]>([]);
  const [sources, setSources] = useState<AnswerSource[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);

  const generate = useCallback(async ({ campaignId, ...body }: GenerateHooksParams) => {
    setIsStreaming(true);
    setError(null);
    setHooks([]);
    setSources([]);
    setStatus(null);
    abortRef.current = false;

    try {
      const stream = api.stream<GenerationSSEEvent>(
        `/api/campaigns/${campaignId}/generate/hooks`,
        body
      );

      for await (const event of stream) {
        if (abortRef.current) break;

        switch (event.type) {
          case "status":
            setStatus(event.message);
            break;
          case "hook":
            setHooks((prev) => [...prev, event.hook]);
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

  const regenerateOne = useCallback(async (index: number, params: GenerateHooksParams) => {
    setIsStreaming(true);
    setError(null);
    setStatus(null);
    abortRef.current = false;

    try {
      const stream = api.stream<GenerationSSEEvent>(
        `/api/campaigns/${params.campaignId}/generate/hooks`,
        { ...params, count: 1 }
      );

      for await (const event of stream) {
        if (abortRef.current) break;

        switch (event.type) {
          case "status":
            setStatus(event.message);
            break;
          case "hook":
            setHooks((prev) => {
              const updated = [...prev];
              updated[index] = event.hook;
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

  return { generate, regenerateOne, abort, hooks, sources, status, error, isStreaming };
}
