// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db/index.js";
import { locations, type Location, type NewLocation } from "@/db/schema/index.js";

export async function createLocation(
  data: Pick<
    NewLocation,
    | "campaignId"
    | "createdBy"
    | "name"
    | "terrain"
    | "climate"
    | "size"
    | "readAloud"
    | "keyFeatures"
    | "pointsOfInterest"
    | "encounters"
    | "secrets"
    | "npcsPresent"
    | "factions"
    | "sensoryDetails"
    | "tags"
    | "isGenerated"
    | "notes"
  >
): Promise<Location | null> {
  const result = await db.insert(locations).values(data).returning();
  return result[0] ?? null;
}

export interface FindLocationsOptions {
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function findLocationsByCampaignId(
  campaignId: string,
  options: FindLocationsOptions = {}
): Promise<Location[]> {
  const conditions: SQL[] = [eq(locations.campaignId, campaignId)];

  if (options.search) {
    conditions.push(ilike(locations.name, `%${options.search}%`));
  }

  const query = db
    .select()
    .from(locations)
    .where(and(...conditions))
    .orderBy(desc(locations.createdAt));

  if (options.limit !== undefined) {
    query.limit(options.limit);
  }

  if (options.offset !== undefined) {
    query.offset(options.offset);
  }

  return query;
}

export async function findLocationByIdAndCampaignId(
  id: string,
  campaignId: string
): Promise<Location | null> {
  const result = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.campaignId, campaignId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateLocation(
  id: string,
  campaignId: string,
  data: {
    name?: string | undefined;
    terrain?: string | null | undefined;
    climate?: string | null | undefined;
    size?: string | null | undefined;
    readAloud?: string | null | undefined;
    keyFeatures?: string[] | null | undefined;
    pointsOfInterest?: string[] | null | undefined;
    encounters?: string[] | null | undefined;
    secrets?: string[] | null | undefined;
    npcsPresent?: string[] | null | undefined;
    factions?: string[] | null | undefined;
    sensoryDetails?: { sights?: string | undefined; sounds?: string | undefined; smells?: string | undefined } | null | undefined;
    tags?: string[] | null | undefined;
    isGenerated?: boolean | undefined;
    notes?: string | null | undefined;
  }
): Promise<Location | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.terrain !== undefined) updateData.terrain = data.terrain;
  if (data.climate !== undefined) updateData.climate = data.climate;
  if (data.size !== undefined) updateData.size = data.size;
  if (data.readAloud !== undefined) updateData.readAloud = data.readAloud;
  if (data.keyFeatures !== undefined) updateData.keyFeatures = data.keyFeatures;
  if (data.pointsOfInterest !== undefined) updateData.pointsOfInterest = data.pointsOfInterest;
  if (data.encounters !== undefined) updateData.encounters = data.encounters;
  if (data.secrets !== undefined) updateData.secrets = data.secrets;
  if (data.npcsPresent !== undefined) updateData.npcsPresent = data.npcsPresent;
  if (data.factions !== undefined) updateData.factions = data.factions;
  if (data.sensoryDetails !== undefined) updateData.sensoryDetails = data.sensoryDetails;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.isGenerated !== undefined) updateData.isGenerated = data.isGenerated;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const result = await db
    .update(locations)
    .set(updateData)
    .where(and(eq(locations.id, id), eq(locations.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteLocation(
  id: string,
  campaignId: string
): Promise<Location | null> {
  const result = await db
    .delete(locations)
    .where(and(eq(locations.id, id), eq(locations.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}
