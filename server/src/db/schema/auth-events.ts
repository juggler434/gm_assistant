// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const authEventTypeEnum = pgEnum("auth_event_type", [
  "register",
  "register_duplicate",
  "login_success",
  "login_failure",
  "logout",
  "password_reset_request",
  "password_reset_complete",
  "sessions_invalidated",
]);

export const authEvents = pgTable(
  "auth_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: authEventTypeEnum("event_type").notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 512 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_events_user_id_idx").on(table.userId),
    index("auth_events_event_type_idx").on(table.eventType),
    index("auth_events_created_at_idx").on(table.createdAt),
  ]
);

export type AuthEvent = typeof authEvents.$inferSelect;
export type NewAuthEvent = typeof authEvents.$inferInsert;
export type AuthEventType = (typeof authEventTypeEnum.enumValues)[number];
