// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { config } from "@/config/index.js";
import { requireAuth } from "@/modules/auth/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import { getStripe, isStripeConfigured } from "./stripe.js";
import { priceIdFromPlanId, initPriceMappings } from "./plans.js";
import { checkoutBodySchema } from "./schemas.js";
import {
  findSubscriptionByUserId,
  createSubscription,
  getOrCreateUsageRecord,
  getUserStorageBytes,
  getUserCampaignCount,
} from "./repository.js";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
} from "./webhook.js";
import { PLAN_TIERS, type PlanId } from "@gm-assistant/shared";

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  initPriceMappings();

  // POST /api/billing/checkout — Create a Stripe Checkout session
  app.post("/checkout", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!isStripeConfigured()) {
      return reply.status(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Billing is not configured",
      });
    }

    const bodyResult = checkoutBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: bodyResult.error.issues[0]?.message ?? "Invalid plan",
      });
    }

    const { planId } = bodyResult.data;
    const userId = request.userId!;
    const stripe = getStripe();

    const priceId = priceIdFromPlanId(planId);
    if (!priceId) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Plan is not available",
      });
    }

    // Get or create Stripe customer
    let sub = await findSubscriptionByUserId(userId);
    let customerId: string;

    if (sub?.stripeCustomerId) {
      customerId = sub.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        metadata: { userId },
      });
      customerId = customer.id;

      sub = await createSubscription({
        userId,
        stripeCustomerId: customerId,
        planId,
        status: "incomplete",
      });
    }

    // If user already has an active subscription, redirect to portal instead
    if (sub && sub.status === "active") {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${config.appUrl}/billing`,
      });
      return reply.status(200).send({ url: portalSession.url });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.appUrl}/campaigns?subscribed=1`,
      cancel_url: `${config.appUrl}/choose-plan`,
      metadata: { userId, planId },
    });

    trackEvent(userId, "billing_checkout_started", { planId });

    return reply.status(200).send({ url: session.url });
  });

  // POST /api/billing/portal — Create a Stripe Customer Portal session
  app.post("/portal", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!isStripeConfigured()) {
      return reply.status(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Billing is not configured",
      });
    }

    const userId = request.userId!;
    const sub = await findSubscriptionByUserId(userId);
    if (!sub?.stripeCustomerId) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "No subscription found",
      });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${config.appUrl}/billing`,
    });

    return reply.status(200).send({ url: session.url });
  });

  // GET /api/billing/status — Get subscription + usage
  app.get("/status", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.userId!;
    const sub = await findSubscriptionByUserId(userId);

    if (!sub || !sub.currentPeriodStart || !sub.currentPeriodEnd) {
      return reply.status(200).send({
        subscription: null,
        usage: {
          ragQueries: 0,
          contentGenerations: 0,
          sessionSummaries: 0,
          storageBytes: 0,
          campaigns: 0,
        },
        limits: null,
      });
    }

    const [usageRecord, storageBytes, campaignCount] = await Promise.all([
      getOrCreateUsageRecord(
        userId,
        sub.currentPeriodStart,
        sub.currentPeriodEnd
      ),
      getUserStorageBytes(userId),
      getUserCampaignCount(userId),
    ]);

    const plan = PLAN_TIERS[sub.planId as PlanId];

    return reply.status(200).send({
      subscription: {
        planId: sub.planId,
        status: sub.status,
        currentPeriodStart: sub.currentPeriodStart.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      },
      usage: {
        ragQueries: usageRecord?.ragQueries ?? 0,
        contentGenerations: usageRecord?.contentGenerations ?? 0,
        sessionSummaries: usageRecord?.sessionSummaries ?? 0,
        storageBytes,
        campaigns: campaignCount,
      },
      limits: plan?.limits ?? null,
    });
  });
}

export async function billingWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Custom content type parser to preserve the raw body for Stripe signature verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // POST /api/billing/webhook — Stripe webhook
  app.post("/webhook", async (request, reply) => {
    if (!isStripeConfigured() || !config.stripe.webhookSecret) {
      return reply.status(503).send({ received: false });
    }

    const stripe = getStripe();
    const sig = request.headers["stripe-signature"];

    if (!sig) {
      return reply
        .status(400)
        .send({ error: "Missing stripe-signature header" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig,
        config.stripe.webhookSecret
      );
    } catch (err) {
      request.log.warn({ err }, "Webhook signature verification failed");
      return reply.status(400).send({ error: "Invalid signature" });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object, request.log);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object, request.log);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, request.log);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object, request.log);
        break;
      default:
        request.log.debug({ type: event.type }, "Unhandled webhook event");
    }

    return reply.status(200).send({ received: true });
  });
}
