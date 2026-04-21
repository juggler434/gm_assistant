// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const checkoutBodySchema = z.object({
  planId: z.enum(["acolyte", "wizard", "archmage"]),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
