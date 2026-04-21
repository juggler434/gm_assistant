// SPDX-License-Identifier: AGPL-3.0-or-later

import type Stripe from "stripe";
import type { FastifyBaseLogger } from "fastify";
import { getStripe } from "./stripe.js";
import { planIdFromPriceId } from "./plans.js";
import {
  findSubscriptionByStripeCustomerId,
  findSubscriptionByStripeSubscriptionId,
  updateSubscriptionByStripeCustomerId,
  updateSubscriptionByStripeSubscriptionId,
  getOrCreateUsageRecord,
} from "./repository.js";
import type { SubscriptionStatus } from "@gm-assistant/shared";

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  if (!item) return null;
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
}

function getInvoiceSubscriptionId(
  invoice: Stripe.Invoice
): string | null {
  if (
    !invoice.parent ||
    invoice.parent.type !== "subscription_details" ||
    !invoice.parent.subscription_details
  ) {
    return null;
  }
  const sub = invoice.parent.subscription_details.subscription;
  return typeof sub === "string" ? sub : sub?.id ?? null;
}

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  log: FastifyBaseLogger
): Promise<void> {
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!customerId || !subscriptionId) {
    log.warn(
      { sessionId: session.id },
      "Checkout session missing customer or subscription"
    );
    return;
  }

  const sub = await findSubscriptionByStripeCustomerId(customerId);
  if (!sub) {
    log.warn(
      { customerId },
      "No subscription record found for Stripe customer"
    );
    return;
  }

  const planId =
    (session.metadata?.planId as "acolyte" | "wizard" | "archmage") ??
    sub.planId;

  // Fetch the full subscription from Stripe to get period dates
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  const period = getSubscriptionPeriod(stripeSub);
  const priceId = stripeSub.items.data[0]?.price.id;

  const updated = await updateSubscriptionByStripeCustomerId(customerId, {
    stripeSubscriptionId: subscriptionId,
    stripePriceId: priceId,
    planId,
    status: "active",
    ...(period && {
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    }),
  });

  // Create the initial usage record for this billing period
  if (updated && period) {
    await getOrCreateUsageRecord(updated.userId, period.start, period.end);
  }

  if (updated) {
    log.info(
      { userId: updated.userId, subscriptionId, planId },
      "Checkout completed, subscription linked and activated"
    );
  }
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  log: FastifyBaseLogger
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) {
    log.warn({ subscriptionId: subscription.id }, "Subscription has no price");
    return;
  }

  const planId = planIdFromPriceId(priceId);
  if (!planId) {
    log.warn({ priceId }, "Unknown price ID, cannot map to plan");
    return;
  }

  const period = getSubscriptionPeriod(subscription);

  const updateData = {
    stripeSubscriptionId: subscription.id,
    planId,
    stripePriceId: priceId,
    status: subscription.status as SubscriptionStatus,
    ...(period && {
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    }),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };

  // Try by subscription ID first, fall back to customer ID
  let updated = await updateSubscriptionByStripeSubscriptionId(
    subscription.id,
    updateData
  );

  if (!updated) {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;
    if (customerId) {
      updated = await updateSubscriptionByStripeCustomerId(
        customerId,
        updateData
      );
    }
  }

  if (!updated) {
    log.warn(
      { stripeSubscriptionId: subscription.id },
      "No subscription record found to update"
    );
    return;
  }

  log.info(
    { userId: updated.userId, planId, status: subscription.status },
    "Subscription updated"
  );
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  log: FastifyBaseLogger
): Promise<void> {
  let updated = await updateSubscriptionByStripeSubscriptionId(
    subscription.id,
    { status: "canceled", cancelAtPeriodEnd: false }
  );

  if (!updated) {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;
    if (customerId) {
      updated = await updateSubscriptionByStripeCustomerId(customerId, {
        stripeSubscriptionId: subscription.id,
        status: "canceled",
        cancelAtPeriodEnd: false,
      });
    }
  }

  if (!updated) {
    log.warn(
      { stripeSubscriptionId: subscription.id },
      "No subscription record found to cancel"
    );
    return;
  }

  log.info({ userId: updated.userId }, "Subscription canceled");
}

export async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  log: FastifyBaseLogger
): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const sub = await findSubscriptionByStripeSubscriptionId(subscriptionId);
  if (!sub) return;

  if (invoice.period_start && invoice.period_end) {
    await getOrCreateUsageRecord(
      sub.userId,
      new Date(invoice.period_start * 1000),
      new Date(invoice.period_end * 1000)
    );
    log.info(
      { userId: sub.userId },
      "Usage record created for new billing period"
    );
  }
}
