// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { campaigns } from "./campaigns.js";

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    terrain: varchar("terrain", { length: 100 }),
    climate: varchar("climate", { length: 100 }),
    size: varchar("size", { length: 50 }),

    readAloud: text("read_aloud"),
    keyFeatures: text("key_features").array().default([]),
    pointsOfInterest: text("points_of_interest").array().default([]),
    encounters: text("encounters").array().default([]),
    secrets: text("secrets").array().default([]),
    npcsPresent: text("npcs_present").array().default([]),
    factions: text("factions").array().default([]),

    sensoryDetails: jsonb("sensory_details").$type<{
      sights?: string | undefined;
      sounds?: string | undefined;
      smells?: string | undefined;
    }>(),

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
    index("locations_campaign_id_idx").on(table.campaignId),
    index("locations_created_by_idx").on(table.createdBy),
  ]
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
