import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/index.js";
import { campaigns, type Campaign, type NewCampaign } from "@/db/schema/index.js";

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
