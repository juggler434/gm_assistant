// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db/index.js";
import { npcs, type Npc, type NewNpc } from "@/db/schema/index.js";

export async function createNpc(
  data: Pick<
    NewNpc,
    | "campaignId"
    | "createdBy"
    | "name"
    | "race"
    | "classRole"
    | "level"
    | "appearance"
    | "personality"
    | "motivations"
    | "secrets"
    | "backstory"
    | "statBlock"
    | "importance"
    | "status"
    | "tags"
    | "isGenerated"
    | "notes"
  >
): Promise<Npc | null> {
  const result = await db.insert(npcs).values(data).returning();
  return result[0] ?? null;
}

export interface FindNpcsOptions {
  search?: string | undefined;
  status?: string | undefined;
  importance?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function findNpcsByCampaignId(
  campaignId: string,
  options: FindNpcsOptions = {}
): Promise<Npc[]> {
  const conditions: SQL[] = [eq(npcs.campaignId, campaignId)];

  if (options.search) {
    conditions.push(ilike(npcs.name, `%${options.search}%`));
  }

  if (options.status) {
    conditions.push(eq(npcs.status, options.status as Npc["status"]));
  }

  if (options.importance) {
    conditions.push(eq(npcs.importance, options.importance as Npc["importance"]));
  }

  const query = db
    .select()
    .from(npcs)
    .where(and(...conditions))
    .orderBy(desc(npcs.createdAt));

  if (options.limit !== undefined) {
    query.limit(options.limit);
  }

  if (options.offset !== undefined) {
    query.offset(options.offset);
  }

  return query;
}

export async function findNpcByIdAndCampaignId(
  id: string,
  campaignId: string
): Promise<Npc | null> {
  const result = await db
    .select()
    .from(npcs)
    .where(and(eq(npcs.id, id), eq(npcs.campaignId, campaignId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateNpc(
  id: string,
  campaignId: string,
  data: {
    name?: string | undefined;
    race?: string | null | undefined;
    classRole?: string | null | undefined;
    level?: string | null | undefined;
    appearance?: string | null | undefined;
    personality?: string | null | undefined;
    motivations?: string | null | undefined;
    secrets?: string | null | undefined;
    backstory?: string | null | undefined;
    statBlock?: Record<string, unknown> | null | undefined;
    importance?: string | undefined;
    status?: string | undefined;
    tags?: string[] | null | undefined;
    isGenerated?: boolean | undefined;
    notes?: string | null | undefined;
  }
): Promise<Npc | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.race !== undefined) updateData.race = data.race;
  if (data.classRole !== undefined) updateData.classRole = data.classRole;
  if (data.level !== undefined) updateData.level = data.level;
  if (data.appearance !== undefined) updateData.appearance = data.appearance;
  if (data.personality !== undefined) updateData.personality = data.personality;
  if (data.motivations !== undefined) updateData.motivations = data.motivations;
  if (data.secrets !== undefined) updateData.secrets = data.secrets;
  if (data.backstory !== undefined) updateData.backstory = data.backstory;
  if (data.statBlock !== undefined) updateData.statBlock = data.statBlock;
  if (data.importance !== undefined) updateData.importance = data.importance;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.isGenerated !== undefined) updateData.isGenerated = data.isGenerated;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const result = await db
    .update(npcs)
    .set(updateData)
    .where(and(eq(npcs.id, id), eq(npcs.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteNpc(
  id: string,
  campaignId: string
): Promise<Npc | null> {
  const result = await db
    .delete(npcs)
    .where(and(eq(npcs.id, id), eq(npcs.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}
