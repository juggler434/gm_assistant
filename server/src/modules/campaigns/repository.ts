// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
  campaigns,
  documents,
  chunks,
  type Campaign,
  type NewCampaign,
} from "@/db/schema/index.js";

export async function createCampaign(
  data: Pick<NewCampaign, "userId" | "name" | "description">
): Promise<Campaign | null> {
  const result = await db.insert(campaigns).values(data).returning();
  return result[0] ?? null;
}

export async function findCampaignsByUserId(userId: string): Promise<Campaign[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(campaigns.createdAt));
}

export async function findCampaignById(id: string): Promise<Campaign | null> {
  const result = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function findCampaignByIdAndUserId(
  id: string,
  userId: string
): Promise<Campaign | null> {
  const result = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateCampaign(
  id: string,
  userId: string,
  data: { name?: string | undefined; description?: string | null | undefined }
): Promise<Campaign | null> {
  // Filter out undefined values to only update provided fields
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  const result = await db
    .update(campaigns)
    .set(updateData)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteCampaign(
  id: string,
  userId: string
): Promise<Campaign | null> {
  const result = await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .returning();
  return result[0] ?? null;
}

export interface CampaignStats {
  documentCount: number;
  totalSizeBytes: number;
  chunkCount: number;
  documentsByStatus: Record<string, number>;
}

export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats> {
  const [docStats, statusBreakdown, chunkStats] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`,
        totalSize: sql<number>`coalesce(sum(${documents.fileSize}), 0)::bigint`,
      })
      .from(documents)
      .where(eq(documents.campaignId, campaignId)),
    db
      .select({
        status: documents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(documents)
      .where(eq(documents.campaignId, campaignId))
      .groupBy(documents.status),
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(chunks)
      .where(eq(chunks.campaignId, campaignId)),
  ]);

  const documentsByStatus: Record<string, number> = {};
  for (const row of statusBreakdown) {
    documentsByStatus[row.status] = row.count;
  }

  return {
    documentCount: docStats[0]?.count ?? 0,
    totalSizeBytes: Number(docStats[0]?.totalSize ?? 0),
    chunkCount: chunkStats[0]?.count ?? 0,
    documentsByStatus,
  };
}
