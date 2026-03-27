// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, sql, ne } from "drizzle-orm";
import { db } from "@/db/index.js";
import { documents } from "@/db/schema/index.js";

/**
 * Find document IDs that match any of the given tags.
 * Uses PostgreSQL array overlap (&&) operator on the tags column.
 * Only returns documents with status = 'ready'.
 */
export async function findDocumentIdsByTags(
  campaignId: string,
  tags: string[],
): Promise<string[]> {
  const result = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.campaignId, campaignId),
        eq(documents.status, "ready"),
        sql`${documents.tags} && ${tags}::text[]`,
      ),
    );

  return result.map((row) => row.id);
}

/**
 * Find transcript document IDs matching optional date range and session ID filters.
 */
export async function findTranscriptDocumentIds(
  campaignId: string,
  filters?: {
    dateRange?: { from: string; to: string } | undefined;
    sessionIds?: string[] | undefined;
  },
): Promise<string[]> {
  const conditions = [
    eq(documents.campaignId, campaignId),
    eq(documents.status, "ready"),
    eq(documents.documentType, "transcript"),
  ];

  if (filters?.dateRange) {
    conditions.push(
      sql`(${documents.metadata}->>'sessionDate')::timestamptz >= ${filters.dateRange.from}::timestamptz`,
    );
    conditions.push(
      sql`(${documents.metadata}->>'sessionDate')::timestamptz <= ${filters.dateRange.to}::timestamptz`,
    );
  }

  if (filters?.sessionIds && filters.sessionIds.length > 0) {
    conditions.push(
      sql`${documents.metadata}->>'sessionId' = ANY(${filters.sessionIds}::text[])`,
    );
  }

  const result = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(...conditions));

  return result.map((row) => row.id);
}

/**
 * Find all non-transcript document IDs for a campaign (ready status).
 */
export async function findNonTranscriptDocumentIds(
  campaignId: string,
): Promise<string[]> {
  const result = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.campaignId, campaignId),
        eq(documents.status, "ready"),
        ne(documents.documentType, "transcript"),
      ),
    );

  return result.map((row) => row.id);
}
