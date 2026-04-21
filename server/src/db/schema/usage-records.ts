// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  uuid,
  timestamp,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    ragQueries: integer("rag_queries").notNull().default(0),
    contentGenerations: integer("content_generations").notNull().default(0),
    sessionSummaries: integer("session_summaries").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("usage_records_user_id_idx").on(table.userId),
    unique("usage_records_user_period_uniq").on(
      table.userId,
      table.periodStart
    ),
  ]
);

export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
