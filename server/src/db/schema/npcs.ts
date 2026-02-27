// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  pgEnum,
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

export const npcStatusEnum = pgEnum("npc_status", [
  "alive",
  "dead",
  "unknown",
  "missing",
]);

export const npcImportanceEnum = pgEnum("npc_importance", [
  "major",
  "minor",
  "background",
]);

export const npcs = pgTable(
  "npcs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    race: varchar("race", { length: 100 }),
    classRole: varchar("class_role", { length: 100 }),
    level: varchar("level", { length: 50 }),

    appearance: text("appearance"),
    personality: text("personality"),
    motivations: text("motivations"),
    secrets: text("secrets"),
    backstory: text("backstory"),

    statBlock: jsonb("stat_block").$type<Record<string, unknown>>(),

    importance: npcImportanceEnum("importance").notNull().default("minor"),
    status: npcStatusEnum("status").notNull().default("alive"),
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
    index("npcs_campaign_id_idx").on(table.campaignId),
    index("npcs_created_by_idx").on(table.createdBy),
    index("npcs_importance_idx").on(table.importance),
    index("npcs_status_idx").on(table.status),
  ]
);

export type Npc = typeof npcs.$inferSelect;
export type NewNpc = typeof npcs.$inferInsert;
export type NpcStatus = (typeof npcStatusEnum.enumValues)[number];
export type NpcImportance = (typeof npcImportanceEnum.enumValues)[number];
