// SPDX-License-Identifier: AGPL-3.0-or-later

import { ok, err, type Result } from "@/types/index.js";

export interface DiarizationConfig {
  baseUrl: string;
  timeout: number;
}

export interface DiarizationSpeakerSegment {
  speaker: string;
  start: number;
  end: number;
}

export interface DiarizationResponse {
  speakers: DiarizationSpeakerSegment[];
}

export interface DiarizationError {
  code: "NETWORK_ERROR" | "TIMEOUT" | "API_ERROR" | "INVALID_RESPONSE";
  message: string;
  statusCode?: number;
}

/**
 * Send audio to a diarization service and receive speaker segments.
 * Expects a pyannote-audio compatible HTTP API that accepts audio
 * and returns time-aligned speaker labels.
 */
export async function diarizeAudio(
  audio: Buffer,
  config: DiarizationConfig,
  signal?: AbortSignal,
): Promise<Result<DiarizationResponse, DiarizationError>> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audio], { type: "audio/webm" }),
    "audio.webm",
  );

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/diarize`, {
      method: "POST",
      body: formData,
      signal: signal ?? AbortSignal.timeout(config.timeout),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return err({
        code: "TIMEOUT",
        message: `Diarization request timed out after ${config.timeout}ms`,
      });
    }
    return err({
      code: "NETWORK_ERROR",
      message: `Failed to connect to diarization service: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (!response.ok) {
    let message = `Diarization API returned ${response.status}`;
    try {
      const body = await response.text();
      if (body) message += `: ${body}`;
    } catch {
      // ignore body read errors
    }
    return err({
      code: "API_ERROR",
      message,
      statusCode: response.status,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err({
      code: "INVALID_RESPONSE",
      message: "Diarization API returned invalid JSON",
    });
  }

  const parsed = body as Record<string, unknown>;
  const rawSpeakers = Array.isArray(parsed.speakers) ? parsed.speakers : [];

  const speakers: DiarizationSpeakerSegment[] = rawSpeakers
    .filter(
      (s: unknown): s is Record<string, unknown> =>
        typeof s === "object" && s !== null,
    )
    .map((s) => ({
      speaker: typeof s.speaker === "string" ? s.speaker : "unknown",
      start: typeof s.start === "number" ? s.start : 0,
      end: typeof s.end === "number" ? s.end : 0,
    }));

  return ok({ speakers });
}

/**
 * Map diarization speaker labels onto transcript segments using time overlap.
 * For each transcript segment, finds the diarization speaker with the greatest
 * overlap and assigns a human-friendly label (e.g. "Speaker 1").
 */
export function mapSpeakersToSegments<
  T extends { startTime: number; endTime: number; speaker: string },
>(
  segments: T[],
  diarizationSpeakers: DiarizationSpeakerSegment[],
): T[] {
  if (diarizationSpeakers.length === 0) return segments;

  // Build a mapping from raw diarization labels (e.g. "SPEAKER_00") to
  // friendly labels ("Speaker 1", "Speaker 2", ...) in order of first
  // appearance.
  const labelMap = new Map<string, string>();
  let nextSpeakerNum = 1;

  for (const ds of diarizationSpeakers) {
    if (!labelMap.has(ds.speaker)) {
      labelMap.set(ds.speaker, `Speaker ${nextSpeakerNum}`);
      nextSpeakerNum++;
    }
  }

  return segments.map((segment) => {
    const bestSpeaker = findBestSpeaker(
      segment.startTime,
      segment.endTime,
      diarizationSpeakers,
    );
    return {
      ...segment,
      speaker: bestSpeaker ? (labelMap.get(bestSpeaker) ?? bestSpeaker) : segment.speaker,
    };
  });
}

/**
 * Find the diarization speaker with the most time overlap for a given range.
 */
function findBestSpeaker(
  start: number,
  end: number,
  speakers: DiarizationSpeakerSegment[],
): string | null {
  const overlapBySpeaker = new Map<string, number>();

  for (const ds of speakers) {
    const overlapStart = Math.max(start, ds.start);
    const overlapEnd = Math.min(end, ds.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (overlap > 0) {
      overlapBySpeaker.set(
        ds.speaker,
        (overlapBySpeaker.get(ds.speaker) ?? 0) + overlap,
      );
    }
  }

  if (overlapBySpeaker.size === 0) return null;

  let bestSpeaker = "";
  let bestOverlap = 0;
  for (const [speaker, overlap] of overlapBySpeaker) {
    if (overlap > bestOverlap) {
      bestSpeaker = speaker;
      bestOverlap = overlap;
    }
  }

  return bestSpeaker;
}
