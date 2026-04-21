// SPDX-License-Identifier: AGPL-3.0-or-later

import Stripe from "stripe";
import { config } from "@/config/index.js";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!config.stripe.secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeInstance = new Stripe(config.stripe.secretKey);
  }
  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return !!config.stripe.secretKey;
}
