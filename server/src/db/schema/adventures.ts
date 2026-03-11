// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { campaigns } from "./campaigns.js";
import { adventureOutlines } from "./adventure-outlines.js";
import type { AdventureScene } from "@gm-assistant/shared";

export const adventures = pgTable(
  "adventures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 255 }).notNull(),
    synopsis: text("synopsis").notNull(),
    estimatedDuration: varchar("estimated_duration", { length: 100 }),
    scenes: jsonb("scenes")
      .notNull()
      .$type<AdventureScene[]>()
      .default([]),
    npcs: text("npcs").array().default([]),
    locations: text("locations").array().default([]),
    factions: text("factions").array().default([]),
    tags: text("tags").array().default([]),
    isGenerated: boolean("is_generated").notNull().default(false),
    sourceOutlineId: uuid("source_outline_id")
      .references(() => adventureOutlines.id, { onDelete: "set null" }),
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
    index("adventures_campaign_id_idx").on(table.campaignId),
    index("adventures_created_by_idx").on(table.createdBy),
  ]
);

export type AdventureRow = typeof adventures.$inferSelect;
export type NewAdventureRow = typeof adventures.$inferInsert;
