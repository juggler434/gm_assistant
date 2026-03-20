// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Session Summary Generation Job
 *
 * Background job that generates a structured summary from a session transcript:
 * 1. Load transcript from the database
 * 2. Generate summary via LLM (single-pass or chunked)
 * 3. Store summary in the database
 *
 * On failure, marks the summary status as "error".
 */

import {
  findTranscriptBySessionId,
  findSummaryBySessionId,
  updateSummary,
} from "@/modules/sessions/repository.js";
import { generateSessionSummary } from "@/modules/sessions/summary-service.js";
import { trackEvent } from "@/services/metrics/index.js";
import { registerHandler } from "./handlers/index.js";
import type { BaseJobData, JobContext } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface SessionSummaryJobData extends BaseJobData {
  sessionId: string;
  campaignId: string;
}

// ============================================================================
// Job Handler
// ============================================================================

async function handleSessionSummary(
  data: SessionSummaryJobData,
  context: JobContext,
): Promise<void> {
  const { sessionId, campaignId } = data;
  const startTime = Date.now();

  context.logger.info("Starting session summary generation", {
    sessionId,
    campaignId,
  });

  // ---- Validate summary record exists ----
  const summary = await findSummaryBySessionId(sessionId);
  if (!summary) {
    context.logger.error("Summary record not found", { sessionId });
    throw new Error(`Summary record for session ${sessionId} not found`);
  }

  // ---- Stage 1: Load transcript (0 → 10%) ----
  await context.updateProgress({
    percentage: 0,
    message: "Loading transcript",
    metadata: { stage: "load" },
  });

  const transcript = await findTranscriptBySessionId(sessionId);
  if (!transcript) {
    context.logger.error("Transcript not found", { sessionId });
    await updateSummary(summary.id, {
      status: "error",
      generationError: "Transcript not found for this session",
    });
    throw new Error(`Transcript for session ${sessionId} not found`);
  }

  if (!transcript.content || transcript.content.trim().length === 0) {
    await updateSummary(summary.id, {
      status: "error",
      generationError: "Transcript is empty",
    });
    throw new Error("Transcript content is empty");
  }

  await context.updateProgress({
    percentage: 10,
    message: "Transcript loaded",
    metadata: {
      stage: "load",
      contentLength: transcript.content.length,
    },
  });

  // ---- Stage 2: Generate summary via LLM (10 → 90%) ----
  if (context.signal.aborted) {
    await updateSummary(summary.id, {
      status: "error",
      generationError: "Job cancelled",
    });
    throw new Error("Job cancelled");
  }

  await context.updateProgress({
    percentage: 10,
    message: "Generating summary",
    metadata: { stage: "generation" },
  });

  let generated;
  try {
    generated = await generateSessionSummary(
      transcript.content,
      context.signal,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    context.logger.error("Summary generation failed", {
      sessionId,
      error: errorMessage,
    });
    await updateSummary(summary.id, {
      status: "error",
      generationError: errorMessage,
    });
    throw error;
  }

  await context.updateProgress({
    percentage: 90,
    message: "Summary generated",
    metadata: { stage: "generation" },
  });

  // ---- Stage 3: Store summary (90 → 100%) ----
  if (context.signal.aborted) {
    await updateSummary(summary.id, {
      status: "error",
      generationError: "Job cancelled",
    });
    throw new Error("Job cancelled");
  }

  await context.updateProgress({
    percentage: 90,
    message: "Storing summary",
    metadata: { stage: "storage" },
  });

  await updateSummary(summary.id, {
    content: generated.content,
    keyEvents: generated.keyEvents,
    npcsEncountered: generated.npcsEncountered,
    locationsVisited: generated.locationsVisited,
    itemsAcquired: generated.itemsAcquired,
    openQuestions: generated.openQuestions,
    status: "ready",
    generationError: null,
  });

  await context.updateProgress({
    percentage: 100,
    message: "Session summary complete",
    metadata: { stage: "complete" },
  });

  const durationMs = Date.now() - startTime;

  trackEvent("system", "session_summary_generated", {
    session_id: sessionId,
    campaign_id: campaignId,
    content_length: generated.content.length,
    key_events_count: generated.keyEvents.length,
    npcs_count: generated.npcsEncountered.length,
    processing_duration_ms: durationMs,
  });

  context.logger.info("Session summary generation complete", {
    sessionId,
    durationMs,
    contentLength: generated.content.length,
  });
}

// ============================================================================
// Handler Registration
// ============================================================================

registerHandler<SessionSummaryJobData, void>({
  queueName: "session-summary",
  handler: handleSessionSummary,
  description:
    "Generates a structured summary from a session transcript via LLM",
});

export { handleSessionSummary };
