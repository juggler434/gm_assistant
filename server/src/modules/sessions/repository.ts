// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
  gameSessions,
  transcripts,
  type GameSessionRow,
  type NewGameSession,
  type GameSessionStatus,
  type TranscriptRow,
  type NewTranscript,
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

export async function createTranscript(
  data: NewTranscript
): Promise<TranscriptRow | null> {
  const result = await db.insert(transcripts).values(data).returning();
  return result[0] ?? null;
}
