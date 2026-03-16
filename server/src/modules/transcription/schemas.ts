// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

const startMessageSchema = z.object({
  event: z.literal("start"),
  title: z.string().max(255).optional(),
  saveAudio: z.boolean().optional(),
});

const audioMessageSchema = z.object({
  event: z.literal("audio"),
  data: z.string().min(1),
});

const markerMessageSchema = z.object({
  event: z.literal("marker"),
  label: z.string().min(1).max(255),
  type: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

const stopMessageSchema = z.object({
  event: z.literal("stop"),
});

export const clientMessageSchema = z.discriminatedUnion("event", [
  startMessageSchema,
  audioMessageSchema,
  markerMessageSchema,
  stopMessageSchema,
]);

export const campaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});
