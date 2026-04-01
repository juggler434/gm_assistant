// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Chunked audio transcription for large files.
 *
 * Splits long audio into time-based segments using ffmpeg, transcribes each
 * chunk independently via Whisper, then merges the results with corrected
 * timestamps. Includes post-processing to remove Whisper repetition
 * hallucinations that can occur at chunk boundaries.
 */

import { execFile } from "node:child_process";
import { writeFile, readFile, readdir, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_PATH: string = ffmpegStatic as unknown as string;
import { transcribeAudio } from "./service.js";
import { ok, err, type Result } from "@/types/index.js";
import type {
  WhisperConfig,
  WhisperResponse,
  WhisperSegment,
  WhisperError,
} from "./service.js";

/** Audio files larger than this (bytes) get chunked. 25 MB. */
const CHUNK_THRESHOLD_BYTES = 25 * 1024 * 1024;

/** Duration of each audio chunk in seconds. 10 minutes. */
const CHUNK_DURATION_SECONDS = 600;

interface ChunkedTranscriptionProgress {
  chunksTotal: number;
  chunksCompleted: number;
}

/**
 * Transcribe audio, automatically chunking if the buffer is large.
 * Small files are sent directly to Whisper unchanged.
 */
export async function transcribeAudioChunked(
  audio: Buffer,
  mimeType: string,
  config: WhisperConfig,
  signal?: AbortSignal,
  onProgress?: (progress: ChunkedTranscriptionProgress) => void,
): Promise<Result<WhisperResponse, WhisperError>> {
  if (audio.length < CHUNK_THRESHOLD_BYTES) {
    const result = await transcribeAudio(audio, config, signal);
    if (result.ok) {
      return ok({
        ...result.value,
        segments: removeRepetitions(result.value.segments),
      });
    }
    return result;
  }

  return transcribeWithChunks(audio, mimeType, config, signal, onProgress);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function transcribeWithChunks(
  audio: Buffer,
  mimeType: string,
  config: WhisperConfig,
  signal?: AbortSignal,
  onProgress?: (progress: ChunkedTranscriptionProgress) => void,
): Promise<Result<WhisperResponse, WhisperError>> {
  const workDir = join(tmpdir(), `gm-whisper-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const ext = extensionForMime(mimeType);
    const inputPath = join(workDir, `input${ext}`);
    await writeFile(inputPath, audio);

    const duration = await getAudioDuration(inputPath);
    if (duration == null) {
      return transcribeAudio(audio, config, signal);
    }

    const chunkPaths = await splitAudio(inputPath, workDir);
    if (chunkPaths.length === 0) {
      return transcribeAudio(audio, config, signal);
    }

    // Transcribe each chunk and collect segments with corrected timestamps
    const allSegments: WhisperSegment[] = [];
    let totalDuration = 0;
    const chunksTotal = chunkPaths.length;

    for (let i = 0; i < chunkPaths.length; i++) {
      if (signal?.aborted) {
        return err({ code: "TIMEOUT", message: "Transcription cancelled" });
      }

      const chunkPath = chunkPaths[i]!;
      const chunkBuffer = await readFile(chunkPath);
      const chunkStart = i * CHUNK_DURATION_SECONDS;

      const result = await transcribeAudio(chunkBuffer, config, signal);
      if (!result.ok) return result;

      const { segments, duration: chunkDuration } = result.value;

      // Offset timestamps to absolute positions in the original audio
      for (const s of segments) {
        allSegments.push({
          start: s.start + chunkStart,
          end: s.end + chunkStart,
          text: s.text,
        });
      }

      totalDuration = Math.max(totalDuration, chunkStart + chunkDuration);
      onProgress?.({ chunksTotal, chunksCompleted: i + 1 });
    }

    // Remove Whisper repetition hallucinations and boundary duplicates
    const cleanedSegments = removeRepetitions(allSegments);

    // Build full text from the cleaned segments (not raw chunk text)
    const fullText = cleanedSegments.map((s) => s.text.trim()).join(" ");

    return ok({
      text: fullText,
      segments: cleanedSegments,
      duration: totalDuration,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Use ffmpeg to get duration in seconds. */
function getAudioDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      FFMPEG_PATH,
      ["-i", filePath, "-f", "null", "-"],
      { timeout: 15000 },
      (_error, _stdout, stderr) => {
        const output = stderr ?? "";
        const match = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
        if (match) {
          const hours = parseInt(match[1]!, 10);
          const minutes = parseInt(match[2]!, 10);
          const seconds = parseInt(match[3]!, 10);
          const centis = parseInt(match[4]!, 10);
          resolve(hours * 3600 + minutes * 60 + seconds + centis / 100);
        } else {
          resolve(null);
        }
      },
    );
  });
}

/** Split audio file into non-overlapping time-based chunks using ffmpeg. */
function splitAudio(
  inputPath: string,
  workDir: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const outputPattern = join(workDir, "chunk_%03d.wav");

    // Split into fixed-duration WAV chunks (no overlap).
    // WAV (PCM 16kHz mono) is universally supported by Whisper servers.
    execFile(
      FFMPEG_PATH,
      [
        "-i", inputPath,
        "-f", "segment",
        "-segment_time", String(CHUNK_DURATION_SECONDS),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        "-y",
        outputPattern,
      ],
      { timeout: 120000 },
      async (splitError) => {
        if (splitError) {
          reject(new Error(`ffmpeg split failed: ${splitError.message}`));
          return;
        }
        resolve(await collectChunkPaths(workDir));
      },
    );
  });
}

async function collectChunkPaths(workDir: string): Promise<string[]> {
  const files = await readdir(workDir);
  return files
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".wav"))
    .sort()
    .map((f) => join(workDir, f));
}

/**
 * Remove Whisper repetition hallucinations.
 *
 * Whisper can enter repetition loops — especially at chunk boundaries or
 * during silence — producing the same phrase over and over. This function
 * detects and removes such runs while preserving genuinely repeated dialogue
 * (e.g., a speaker saying "no no no").
 *
 * Detection heuristics:
 * 1. Consecutive segments with very similar text (>80% word overlap)
 *    that repeat 3+ times in a row are collapsed to a single instance.
 * 2. Segments whose text is a near-exact substring of the previous segment
 *    are dropped (partial echoes at chunk boundaries).
 */
export { removeRepetitions as removeWhisperRepetitions };

function removeRepetitions(segments: WhisperSegment[]): WhisperSegment[] {
  if (segments.length < 2) return segments;

  const result: WhisperSegment[] = [];
  let repeatCount = 0;

  for (let i = 0; i < segments.length; i++) {
    const curr = segments[i]!;
    const prev = result[result.length - 1];

    if (!prev) {
      result.push(curr);
      repeatCount = 1;
      continue;
    }

    const currNorm = normalizeText(curr.text);
    const prevNorm = normalizeText(prev.text);

    // Skip empty segments
    if (!currNorm) continue;

    // Check if current is a near-duplicate of previous
    const similarity = textSimilarity(currNorm, prevNorm);

    if (similarity > 0.8) {
      repeatCount++;
      // Allow up to 2 genuine repeats (someone saying "yes yes"),
      // but 3+ consecutive near-identical segments is a Whisper loop
      if (repeatCount <= 2) {
        result.push(curr);
      }
      // else: skip this segment (repetition hallucination)
      continue;
    }

    // Check if current is a partial echo of previous (substring match)
    if (
      currNorm.length > 5 &&
      prevNorm.length > 5 &&
      (prevNorm.includes(currNorm) || currNorm.includes(prevNorm)) &&
      Math.abs(curr.start - prev.start) < 2
    ) {
      // Keep the longer one
      if (currNorm.length > prevNorm.length) {
        result[result.length - 1] = curr;
      }
      continue;
    }

    result.push(curr);
    repeatCount = 1;
  }

  return result;
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s]/g, "");
}

/** Simple word-overlap similarity (0–1). */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function extensionForMime(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/x-wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
  };
  return map[mimeType] ?? ".audio";
}
