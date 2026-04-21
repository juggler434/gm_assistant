// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ISOTimestamp } from "./common.js";

// ============================================================================
// Plan Tiers
// ============================================================================

export type PlanId = "acolyte" | "wizard" | "archmage";

export interface PlanLimits {
  ragQueries: number;
  contentGenerations: number;
  sessionSummaries: number;
  /** Storage limit in bytes. -1 means unlimited. */
  storageBytes: number;
  /** Max campaigns. -1 means unlimited. */
  campaigns: number;
}

export interface PlanTier {
  id: PlanId;
  name: string;
  limits: PlanLimits;
}

const GB = 1024 * 1024 * 1024;

export const PLAN_TIERS: Record<PlanId, PlanTier> = {
  acolyte: {
    id: "acolyte",
    name: "Acolyte",
    limits: {
      ragQueries: 100,
      contentGenerations: 10,
      sessionSummaries: 2,
      storageBytes: 2 * GB,
      campaigns: 3,
    },
  },
  wizard: {
    id: "wizard",
    name: "Wizard",
    limits: {
      ragQueries: 400,
      contentGenerations: 40,
      sessionSummaries: 8,
      storageBytes: 10 * GB,
      campaigns: 10,
    },
  },
  archmage: {
    id: "archmage",
    name: "Archmage",
    limits: {
      ragQueries: 1500,
      contentGenerations: 150,
      sessionSummaries: 25,
      storageBytes: 50 * GB,
      campaigns: -1,
    },
  },
} as const;

// ============================================================================
// Subscription
// ============================================================================

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "unpaid";

export interface SubscriptionInfo {
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: ISOTimestamp;
  currentPeriodEnd: ISOTimestamp;
  cancelAtPeriodEnd: boolean;
}

// ============================================================================
// Usage
// ============================================================================

export type UsageFeature =
  | "ragQueries"
  | "contentGenerations"
  | "sessionSummaries";

export interface UsageInfo {
  ragQueries: number;
  contentGenerations: number;
  sessionSummaries: number;
  storageBytes: number;
  campaigns: number;
}

export interface BillingStatusResponse {
  subscription: SubscriptionInfo | null;
  usage: UsageInfo;
  limits: PlanLimits | null;
}

export interface CheckoutRequest {
  planId: PlanId;
}

export interface CheckoutResponse {
  url: string;
}

export interface PortalResponse {
  url: string;
}
