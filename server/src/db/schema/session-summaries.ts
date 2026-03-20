// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { gameSessions } from "./sessions.js";

export const summaryStatusEnum = pgEnum("summary_status", [
  "pending",
  "generating",
  "ready",
  "error",
]);

export const sessionSummaries = pgTable(
  "session_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .unique()
      .references(() => gameSessions.id, { onDelete: "cascade" }),

    content: text("content").notNull().default(""),
    keyEvents: jsonb("key_events").$type<string[]>().default([]),
    npcsEncountered: jsonb("npcs_encountered").$type<string[]>().default([]),
    locationsVisited: jsonb("locations_visited").$type<string[]>().default([]),
    itemsAcquired: jsonb("items_acquired").$type<string[]>().default([]),
    openQuestions: jsonb("open_questions").$type<string[]>().default([]),

    status: summaryStatusEnum("status").notNull().default("pending"),
    generationError: text("generation_error"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("session_summaries_session_id_idx").on(table.sessionId)]
);

export type SessionSummaryRow = typeof sessionSummaries.$inferSelect;
export type NewSessionSummary = typeof sessionSummaries.$inferInsert;
export type SummaryStatus =
  (typeof summaryStatusEnum.enumValues)[number];
