// SPDX-License-Identifier: AGPL-3.0-or-later

import { ok, err, type Result } from "@/types/index.js";

export interface WhisperConfig {
  baseUrl: string;
  model: string;
  timeout: number;
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperResponse {
  text: string;
  segments: WhisperSegment[];
  duration: number;
}

export interface WhisperError {
  code: "NETWORK_ERROR" | "TIMEOUT" | "API_ERROR" | "INVALID_RESPONSE";
  message: string;
  statusCode?: number;
}

/**
 * Transcribe an audio buffer using a Whisper-compatible HTTP API.
 * Targets the OpenAI-compatible `/v1/audio/transcriptions` endpoint
 * used by faster-whisper-server, whisper.cpp, etc.
 */
export async function transcribeAudio(
  audio: Buffer,
  config: WhisperConfig,
  signal?: AbortSignal
): Promise<Result<WhisperResponse, WhisperError>> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audio], { type: "audio/webm" }),
    "audio.webm"
  );
  formData.append("model", config.model);
  formData.append("response_format", "verbose_json");

  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/v1/audio/transcriptions`,
      {
        method: "POST",
        body: formData,
        signal: signal ?? AbortSignal.timeout(config.timeout),
      }
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return err({
        code: "TIMEOUT",
        message: `Whisper request timed out after ${config.timeout}ms`,
      });
    }
    return err({
      code: "NETWORK_ERROR",
      message: `Failed to connect to Whisper service: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (!response.ok) {
    let message = `Whisper API returned ${response.status}`;
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
      message: "Whisper API returned invalid JSON",
    });
  }

  const parsed = body as Record<string, unknown>;
  const text = typeof parsed.text === "string" ? parsed.text : "";
  const duration = typeof parsed.duration === "number" ? parsed.duration : 0;
  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];

  const segments: WhisperSegment[] = rawSegments
    .filter(
      (s: unknown): s is Record<string, unknown> =>
        typeof s === "object" && s !== null
    )
    .map((s) => ({
      start: typeof s.start === "number" ? s.start : 0,
      end: typeof s.end === "number" ? s.end : 0,
      text: typeof s.text === "string" ? s.text : "",
    }));

  return ok({ text, segments, duration });
}
