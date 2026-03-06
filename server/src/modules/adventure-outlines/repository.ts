// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db/index.js";
import { adventureOutlines, type AdventureOutlineRow, type NewAdventureOutlineRow } from "@/db/schema/index.js";

export async function createAdventureOutline(
  data: Pick<
    NewAdventureOutlineRow,
    | "campaignId"
    | "createdBy"
    | "title"
    | "description"
    | "acts"
    | "npcs"
    | "locations"
    | "factions"
    | "tags"
    | "isGenerated"
    | "notes"
  >
): Promise<AdventureOutlineRow | null> {
  const result = await db.insert(adventureOutlines).values(data).returning();
  return result[0] ?? null;
}

export interface FindAdventureOutlinesOptions {
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function findAdventureOutlinesByCampaignId(
  campaignId: string,
  options: FindAdventureOutlinesOptions = {}
): Promise<AdventureOutlineRow[]> {
  const conditions: SQL[] = [eq(adventureOutlines.campaignId, campaignId)];

  if (options.search) {
    conditions.push(ilike(adventureOutlines.title, `%${options.search}%`));
  }

  const query = db
    .select()
    .from(adventureOutlines)
    .where(and(...conditions))
    .orderBy(desc(adventureOutlines.createdAt));

  if (options.limit !== undefined) {
    query.limit(options.limit);
  }

  if (options.offset !== undefined) {
    query.offset(options.offset);
  }

  return query;
}

export async function findAdventureOutlineByIdAndCampaignId(
  id: string,
  campaignId: string
): Promise<AdventureOutlineRow | null> {
  const result = await db
    .select()
    .from(adventureOutlines)
    .where(and(eq(adventureOutlines.id, id), eq(adventureOutlines.campaignId, campaignId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateAdventureOutline(
  id: string,
  campaignId: string,
  data: {
    title?: string | undefined;
    description?: string | undefined;
    acts?: { title: string; description: string; keyEvents: string[]; encounters: string[] }[] | undefined;
    npcs?: string[] | null | undefined;
    locations?: string[] | null | undefined;
    factions?: string[] | null | undefined;
    tags?: string[] | null | undefined;
    isGenerated?: boolean | undefined;
    notes?: string | null | undefined;
  }
): Promise<AdventureOutlineRow | null> {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.acts !== undefined) updateData.acts = data.acts;
  if (data.npcs !== undefined) updateData.npcs = data.npcs;
  if (data.locations !== undefined) updateData.locations = data.locations;
  if (data.factions !== undefined) updateData.factions = data.factions;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.isGenerated !== undefined) updateData.isGenerated = data.isGenerated;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const result = await db
    .update(adventureOutlines)
    .set(updateData)
    .where(and(eq(adventureOutlines.id, id), eq(adventureOutlines.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteAdventureOutline(
  id: string,
  campaignId: string
): Promise<AdventureOutlineRow | null> {
  const result = await db
    .delete(adventureOutlines)
    .where(and(eq(adventureOutlines.id, id), eq(adventureOutlines.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}
