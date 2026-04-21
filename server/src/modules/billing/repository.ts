// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
  subscriptions,
  usageRecords,
  documents,
  campaigns,
  type Subscription,
  type NewSubscription,
} from "@/db/schema/index.js";
import type { PlanId, SubscriptionStatus, UsageFeature } from "@gm-assistant/shared";

// ============================================================================
// Subscriptions
// ============================================================================

export async function findSubscriptionByUserId(
  userId: string
): Promise<Subscription | null> {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function findSubscriptionByStripeCustomerId(
  stripeCustomerId: string
): Promise<Subscription | null> {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return result[0] ?? null;
}

export async function findSubscriptionByStripeSubscriptionId(
  stripeSubscriptionId: string
): Promise<Subscription | null> {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return result[0] ?? null;
}

export async function createSubscription(
  data: NewSubscription
): Promise<Subscription | null> {
  const result = await db.insert(subscriptions).values(data).returning();
  return result[0] ?? null;
}

export async function updateSubscriptionByStripeSubscriptionId(
  stripeSubscriptionId: string,
  data: {
    planId?: PlanId | undefined;
    stripePriceId?: string | undefined;
    status?: SubscriptionStatus | undefined;
    currentPeriodStart?: Date | undefined;
    currentPeriodEnd?: Date | undefined;
    cancelAtPeriodEnd?: boolean | undefined;
  }
): Promise<Subscription | null> {
  const result = await db
    .update(subscriptions)
    .set(data)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .returning();
  return result[0] ?? null;
}

export async function updateSubscriptionByStripeCustomerId(
  stripeCustomerId: string,
  data: {
    stripeSubscriptionId?: string | undefined;
    stripePriceId?: string | undefined;
    planId?: PlanId | undefined;
    status?: SubscriptionStatus | undefined;
    currentPeriodStart?: Date | undefined;
    currentPeriodEnd?: Date | undefined;
    cancelAtPeriodEnd?: boolean | undefined;
  }
): Promise<Subscription | null> {
  const result = await db
    .update(subscriptions)
    .set(data)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .returning();
  return result[0] ?? null;
}

export async function updateSubscriptionByUserId(
  userId: string,
  data: {
    stripeSubscriptionId?: string | undefined;
    stripePriceId?: string | undefined;
    planId?: PlanId | undefined;
    status?: SubscriptionStatus | undefined;
    currentPeriodStart?: Date | undefined;
    currentPeriodEnd?: Date | undefined;
    cancelAtPeriodEnd?: boolean | undefined;
  }
): Promise<Subscription | null> {
  const result = await db
    .update(subscriptions)
    .set(data)
    .where(eq(subscriptions.userId, userId))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Usage Records
// ============================================================================

export async function getOrCreateUsageRecord(
  userId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const existing = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.periodStart, periodStart)
      )
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const result = await db
    .insert(usageRecords)
    .values({ userId, periodStart, periodEnd })
    .onConflictDoNothing()
    .returning();

  if (result[0]) return result[0];

  // Race condition: another request created it
  const retry = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.periodStart, periodStart)
      )
    )
    .limit(1);
  return retry[0] ?? null;
}

const featureColumnMap: Record<UsageFeature, AnyColumn> = {
  ragQueries: usageRecords.ragQueries,
  contentGenerations: usageRecords.contentGenerations,
  sessionSummaries: usageRecords.sessionSummaries,
};

export async function incrementUsage(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  feature: UsageFeature
) {
  const record = await getOrCreateUsageRecord(userId, periodStart, periodEnd);
  if (!record) return null;

  const column = featureColumnMap[feature];
  const result = await db
    .update(usageRecords)
    .set({ [feature]: sql`${column} + 1` })
    .where(eq(usageRecords.id, record.id))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Aggregate queries for limit checks
// ============================================================================

export async function getUserStorageBytes(userId: string): Promise<number> {
  const result = await db
    .select({
      totalBytes: sql<number>`coalesce(sum(${documents.fileSize}), 0)::bigint`,
    })
    .from(documents)
    .innerJoin(campaigns, eq(documents.campaignId, campaigns.id))
    .where(eq(campaigns.userId, userId));
  return Number(result[0]?.totalBytes ?? 0);
}

export async function getUserCampaignCount(userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(eq(campaigns.userId, userId));
  return result[0]?.count ?? 0;
}
