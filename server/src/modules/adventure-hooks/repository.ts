// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db/index.js";
import { adventureHooks, type AdventureHookRow, type NewAdventureHookRow } from "@/db/schema/index.js";

export async function createAdventureHook(
  data: Pick<
    NewAdventureHookRow,
    | "campaignId"
    | "createdBy"
    | "title"
    | "description"
    | "npcs"
    | "locations"
    | "factions"
    | "tags"
    | "isGenerated"
    | "notes"
  >
): Promise<AdventureHookRow | null> {
  const result = await db.insert(adventureHooks).values(data).returning();
  return result[0] ?? null;
}

export interface FindAdventureHooksOptions {
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function findAdventureHooksByCampaignId(
  campaignId: string,
  options: FindAdventureHooksOptions = {}
): Promise<AdventureHookRow[]> {
  const conditions: SQL[] = [eq(adventureHooks.campaignId, campaignId)];

  if (options.search) {
    conditions.push(ilike(adventureHooks.title, `%${options.search}%`));
  }

  const query = db
    .select()
    .from(adventureHooks)
    .where(and(...conditions))
    .orderBy(desc(adventureHooks.createdAt));

  if (options.limit !== undefined) {
    query.limit(options.limit);
  }

  if (options.offset !== undefined) {
    query.offset(options.offset);
  }

  return query;
}

export async function findAdventureHookByIdAndCampaignId(
  id: string,
  campaignId: string
): Promise<AdventureHookRow | null> {
  const result = await db
    .select()
    .from(adventureHooks)
    .where(and(eq(adventureHooks.id, id), eq(adventureHooks.campaignId, campaignId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateAdventureHook(
  id: string,
  campaignId: string,
  data: {
    title?: string | undefined;
    description?: string | undefined;
    npcs?: string[] | null | undefined;
    locations?: string[] | null | undefined;
    factions?: string[] | null | undefined;
    tags?: string[] | null | undefined;
    isGenerated?: boolean | undefined;
    notes?: string | null | undefined;
  }
): Promise<AdventureHookRow | null> {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.npcs !== undefined) updateData.npcs = data.npcs;
  if (data.locations !== undefined) updateData.locations = data.locations;
  if (data.factions !== undefined) updateData.factions = data.factions;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.isGenerated !== undefined) updateData.isGenerated = data.isGenerated;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const result = await db
    .update(adventureHooks)
    .set(updateData)
    .where(and(eq(adventureHooks.id, id), eq(adventureHooks.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteAdventureHook(
  id: string,
  campaignId: string
): Promise<AdventureHookRow | null> {
  const result = await db
    .delete(adventureHooks)
    .where(and(eq(adventureHooks.id, id), eq(adventureHooks.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}
