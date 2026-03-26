// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
  gameSessions,
  transcripts,
  sessionSummaries,
  type GameSessionRow,
  type NewGameSession,
  type GameSessionStatus,
  type TranscriptSegment,
  type TranscriptRow,
  type NewTranscript,
  type SessionSummaryRow,
  type NewSessionSummary,
} from "@/db/schema/index.js";

export async function createSession(
  data: NewGameSession
): Promise<GameSessionRow | null> {
  const result = await db.insert(gameSessions).values(data).returning();
  return result[0] ?? null;
}

export async function findSessionByIdAndCampaignId(
  id: string,
  campaignId: string
): Promise<GameSessionRow | null> {
  const result = await db
    .select()
    .from(gameSessions)
    .where(
      and(eq(gameSessions.id, id), eq(gameSessions.campaignId, campaignId))
    )
    .limit(1);
  return result[0] ?? null;
}

export interface FindSessionsOptions {
  status?: GameSessionStatus | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function findSessionsByCampaignId(
  campaignId: string,
  options: FindSessionsOptions = {}
): Promise<GameSessionRow[]> {
  const { status, limit = 50, offset = 0 } = options;

  const conditions = [eq(gameSessions.campaignId, campaignId)];
  if (status) {
    conditions.push(eq(gameSessions.status, status));
  }

  return db
    .select()
    .from(gameSessions)
    .where(and(...conditions))
    .orderBy(desc(gameSessions.date))
    .limit(limit)
    .offset(offset);
}

export async function updateSessionStatus(
  id: string,
  status: GameSessionStatus
): Promise<GameSessionRow | null> {
  const result = await db
    .update(gameSessions)
    .set({ status })
    .where(eq(gameSessions.id, id))
    .returning();
  return result[0] ?? null;
}

export async function updateSession(
  id: string,
  data: Partial<Pick<GameSessionRow, "status" | "audioPath" | "duration">>
): Promise<GameSessionRow | null> {
  const result = await db
    .update(gameSessions)
    .set(data)
    .where(eq(gameSessions.id, id))
    .returning();
  return result[0] ?? null;
}

export async function findTranscriptBySessionId(
  sessionId: string
): Promise<TranscriptRow | null> {
  const result = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .limit(1);
  return result[0] ?? null;
}

export async function createTranscript(
  data: NewTranscript
): Promise<TranscriptRow | null> {
  const result = await db.insert(transcripts).values(data).returning();
  return result[0] ?? null;
}

export async function updateTranscriptSegments(
  sessionId: string,
  segments: TranscriptSegment[]
): Promise<TranscriptRow | null> {
  const result = await db
    .update(transcripts)
    .set({ segments })
    .where(eq(transcripts.sessionId, sessionId))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Markers
// ============================================================================

export async function addMarkerToTranscript(
  sessionId: string,
  marker: { time: number; label: string; type: string; notes: string | null }
): Promise<TranscriptRow | null> {
  const transcript = await findTranscriptBySessionId(sessionId);
  if (!transcript) return null;

  const markers = [...(transcript.markers ?? []), marker];
  markers.sort((a, b) => a.time - b.time);

  const result = await db
    .update(transcripts)
    .set({ markers })
    .where(eq(transcripts.sessionId, sessionId))
    .returning();
  return result[0] ?? null;
}

export async function updateMarkerInTranscript(
  sessionId: string,
  originalTime: number,
  originalLabel: string,
  updates: Partial<{ time: number; label: string; type: string; notes: string | null }>
): Promise<TranscriptRow | null> {
  const transcript = await findTranscriptBySessionId(sessionId);
  if (!transcript) return null;

  const markers = (transcript.markers ?? []).map((m) => {
    if (m.time === originalTime && m.label === originalLabel) {
      return {
        ...m,
        ...updates,
      };
    }
    return m;
  });
  markers.sort((a, b) => a.time - b.time);

  const result = await db
    .update(transcripts)
    .set({ markers })
    .where(eq(transcripts.sessionId, sessionId))
    .returning();
  return result[0] ?? null;
}

export async function deleteMarkerFromTranscript(
  sessionId: string,
  markerTime: number,
  markerLabel: string
): Promise<TranscriptRow | null> {
  const transcript = await findTranscriptBySessionId(sessionId);
  if (!transcript) return null;

  const markers = (transcript.markers ?? []).filter(
    (m) => !(m.time === markerTime && m.label === markerLabel)
  );

  const result = await db
    .update(transcripts)
    .set({ markers })
    .where(eq(transcripts.sessionId, sessionId))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Session Summary
// ============================================================================

export async function findSummaryBySessionId(
  sessionId: string
): Promise<SessionSummaryRow | null> {
  const result = await db
    .select()
    .from(sessionSummaries)
    .where(eq(sessionSummaries.sessionId, sessionId))
    .limit(1);
  return result[0] ?? null;
}

export async function createSummary(
  data: NewSessionSummary
): Promise<SessionSummaryRow | null> {
  const result = await db.insert(sessionSummaries).values(data).returning();
  return result[0] ?? null;
}

export async function updateSummary(
  id: string,
  data: Partial<
    Pick<
      SessionSummaryRow,
      | "content"
      | "keyEvents"
      | "npcsEncountered"
      | "locationsVisited"
      | "itemsAcquired"
      | "openQuestions"
      | "status"
      | "generationError"
    >
  >
): Promise<SessionSummaryRow | null> {
  const result = await db
    .update(sessionSummaries)
    .set(data)
    .where(eq(sessionSummaries.id, id))
    .returning();
  return result[0] ?? null;
}
