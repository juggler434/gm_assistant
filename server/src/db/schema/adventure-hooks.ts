// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { campaigns } from "./campaigns.js";

export const adventureHooks = pgTable(
  "adventure_hooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    npcs: text("npcs").array().default([]),
    locations: text("locations").array().default([]),
    factions: text("factions").array().default([]),
    tags: text("tags").array().default([]),
    isGenerated: boolean("is_generated").notNull().default(false),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("adventure_hooks_campaign_id_idx").on(table.campaignId),
    index("adventure_hooks_created_by_idx").on(table.createdBy),
  ]
);

export type AdventureHookRow = typeof adventureHooks.$inferSelect;
export type NewAdventureHookRow = typeof adventureHooks.$inferInsert;
