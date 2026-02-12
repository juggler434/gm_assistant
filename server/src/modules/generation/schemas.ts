import { z } from "zod";

export const generateHooksParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type GenerateHooksParam = z.infer<typeof generateHooksParamSchema>;

export const generateHooksBodySchema = z.object({
  tone: z.enum([
    "dark",
    "comedic",
    "political",
    "mysterious",
    "heroic",
    "horror",
    "intrigue",
  ]),
  theme: z.string().max(200).optional(),
  count: z.number().int().min(1).max(10).optional(),
  partyLevel: z.number().int().min(1).max(20).optional(),
  includeNpcsLocations: z.string().max(500).optional(),
});

export type GenerateHooksBody = z.infer<typeof generateHooksBodySchema>;
