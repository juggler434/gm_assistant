// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, sql } from "drizzle-orm";
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
