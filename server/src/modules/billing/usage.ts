// SPDX-License-Identifier: AGPL-3.0-or-later

import { PLAN_TIERS, type UsageFeature, type PlanLimits } from "@gm-assistant/shared";
import {
  findSubscriptionByUserId,
  getOrCreateUsageRecord,
  incrementUsage as incrementUsageRecord,
  getUserStorageBytes,
  getUserCampaignCount,
} from "./repository.js";

export interface UsageLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  feature: string;
}

export async function checkUsageLimit(
  userId: string,
  feature: UsageFeature
): Promise<UsageLimitResult> {
  const sub = await findSubscriptionByUserId(userId);
  if (!sub || sub.status !== "active") {
    return { allowed: false, current: 0, limit: 0, feature };
  }

  const plan = PLAN_TIERS[sub.planId];
  if (!plan) {
    return { allowed: false, current: 0, limit: 0, feature };
  }

  const limit = plan.limits[feature];
  if (!sub.currentPeriodStart || !sub.currentPeriodEnd) {
    return { allowed: false, current: 0, limit, feature };
  }

  const record = await getOrCreateUsageRecord(
    userId,
    sub.currentPeriodStart,
    sub.currentPeriodEnd
  );
  const current = record ? record[feature] : 0;

  return { allowed: current < limit, current, limit, feature };
}

export async function checkStorageLimit(
  userId: string,
  additionalBytes: number = 0
): Promise<UsageLimitResult> {
  const sub = await findSubscriptionByUserId(userId);
  if (!sub || sub.status !== "active") {
    return { allowed: false, current: 0, limit: 0, feature: "storageBytes" };
  }

  const plan = PLAN_TIERS[sub.planId];
  if (!plan) {
    return { allowed: false, current: 0, limit: 0, feature: "storageBytes" };
  }

  const current = await getUserStorageBytes(userId);
  const limit = plan.limits.storageBytes;

  return {
    allowed: limit === -1 || current + additionalBytes <= limit,
    current,
    limit,
    feature: "storageBytes",
  };
}

export async function checkCampaignLimit(
  userId: string
): Promise<UsageLimitResult> {
  const sub = await findSubscriptionByUserId(userId);
  if (!sub || sub.status !== "active") {
    return { allowed: false, current: 0, limit: 0, feature: "campaigns" };
  }

  const plan = PLAN_TIERS[sub.planId];
  if (!plan) {
    return { allowed: false, current: 0, limit: 0, feature: "campaigns" };
  }

  const current = await getUserCampaignCount(userId);
  const limit = plan.limits.campaigns;

  return {
    allowed: limit === -1 || current < limit,
    current,
    limit,
    feature: "campaigns",
  };
}

export async function recordUsage(
  userId: string,
  feature: UsageFeature
): Promise<void> {
  const sub = await findSubscriptionByUserId(userId);
  if (!sub?.currentPeriodStart || !sub?.currentPeriodEnd) return;
  await incrementUsageRecord(
    userId,
    sub.currentPeriodStart,
    sub.currentPeriodEnd,
    feature
  );
}

export async function getUserLimits(userId: string): Promise<PlanLimits | null> {
  const sub = await findSubscriptionByUserId(userId);
  if (!sub) return null;
  return PLAN_TIERS[sub.planId]?.limits ?? null;
}
