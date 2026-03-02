// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  GenerateLocationsRequest,
  LocationGenerationSSEEvent,
  GeneratedLocation,
  AnswerSource,
} from "@/types";

interface GenerateLocationsParams extends GenerateLocationsRequest {
  campaignId: string;
}

export function useGenerateLocationsStream() {
  const [locations, setLocations] = useState<GeneratedLocation[]>([]);
  const [sources, setSources] = useState<AnswerSource[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);

  const generate = useCallback(async ({ campaignId, ...body }: GenerateLocationsParams) => {
    setIsStreaming(true);
    setError(null);
    setLocations([]);
    setSources([]);
    setStatus(null);
    abortRef.current = false;

    try {
      const stream = api.stream<LocationGenerationSSEEvent>(
        `/api/campaigns/${campaignId}/generate/locations`,
        body
      );

      for await (const event of stream) {
        if (abortRef.current) break;

        switch (event.type) {
          case "status":
            setStatus(event.message);
            break;
          case "location":
            setLocations((prev) => [...prev, event.location]);
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

  return { generate, abort, locations, sources, status, error, isStreaming };
}
