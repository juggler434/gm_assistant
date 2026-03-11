// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db/index.js";
import { adventures, type AdventureRow, type NewAdventureRow } from "@/db/schema/index.js";
import type { AdventureScene } from "@gm-assistant/shared";

export async function createAdventure(
  data: Pick<
    NewAdventureRow,
    | "campaignId"
    | "createdBy"
    | "title"
    | "synopsis"
    | "estimatedDuration"
    | "scenes"
    | "npcs"
    | "locations"
    | "factions"
    | "tags"
    | "isGenerated"
    | "sourceOutlineId"
    | "notes"
  >
): Promise<AdventureRow | null> {
  const result = await db.insert(adventures).values(data).returning();
  return result[0] ?? null;
}

export interface FindAdventuresOptions {
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function findAdventuresByCampaignId(
  campaignId: string,
  options: FindAdventuresOptions = {}
): Promise<AdventureRow[]> {
  const conditions: SQL[] = [eq(adventures.campaignId, campaignId)];

  if (options.search) {
    conditions.push(ilike(adventures.title, `%${options.search}%`));
  }

  const query = db
    .select()
    .from(adventures)
    .where(and(...conditions))
    .orderBy(desc(adventures.createdAt));

  if (options.limit !== undefined) {
    query.limit(options.limit);
  }

  if (options.offset !== undefined) {
    query.offset(options.offset);
  }

  return query;
}

export async function findAdventureByIdAndCampaignId(
  id: string,
  campaignId: string
): Promise<AdventureRow | null> {
  const result = await db
    .select()
    .from(adventures)
    .where(and(eq(adventures.id, id), eq(adventures.campaignId, campaignId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateAdventure(
  id: string,
  campaignId: string,
  data: {
    title?: string | undefined;
    synopsis?: string | undefined;
    estimatedDuration?: string | null | undefined;
    scenes?: AdventureScene[] | undefined;
    npcs?: string[] | null | undefined;
    locations?: string[] | null | undefined;
    factions?: string[] | null | undefined;
    tags?: string[] | null | undefined;
    isGenerated?: boolean | undefined;
    notes?: string | null | undefined;
  }
): Promise<AdventureRow | null> {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.synopsis !== undefined) updateData.synopsis = data.synopsis;
  if (data.estimatedDuration !== undefined) updateData.estimatedDuration = data.estimatedDuration;
  if (data.scenes !== undefined) updateData.scenes = data.scenes;
  if (data.npcs !== undefined) updateData.npcs = data.npcs;
  if (data.locations !== undefined) updateData.locations = data.locations;
  if (data.factions !== undefined) updateData.factions = data.factions;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.isGenerated !== undefined) updateData.isGenerated = data.isGenerated;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const result = await db
    .update(adventures)
    .set(updateData)
    .where(and(eq(adventures.id, id), eq(adventures.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteAdventure(
  id: string,
  campaignId: string
): Promise<AdventureRow | null> {
  const result = await db
    .delete(adventures)
    .where(and(eq(adventures.id, id), eq(adventures.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}
