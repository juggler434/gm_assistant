// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from "@/config/index.js";
import { PLAN_TIERS, type PlanId } from "@gm-assistant/shared";

export { PLAN_TIERS };

const priceIdToPlan = new Map<string, PlanId>();

export function initPriceMappings(): void {
  priceIdToPlan.clear();
  const { acolyte, wizard, archmage } = config.stripe.prices;
  if (acolyte) priceIdToPlan.set(acolyte, "acolyte");
  if (wizard) priceIdToPlan.set(wizard, "wizard");
  if (archmage) priceIdToPlan.set(archmage, "archmage");
}

export function planIdFromPriceId(priceId: string): PlanId | null {
  if (priceIdToPlan.size === 0) initPriceMappings();
  return priceIdToPlan.get(priceId) ?? null;
}

export function priceIdFromPlanId(planId: PlanId): string | null {
  const prices = config.stripe.prices;
  return prices[planId] ?? null;
}
