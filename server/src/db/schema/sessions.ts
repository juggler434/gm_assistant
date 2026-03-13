// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { campaigns } from "./campaigns.js";
import type { TranscriptSegment, TranscriptMarker } from "@gm-assistant/shared";

export type { TranscriptSegment, TranscriptMarker };

// Enum for game session status
export const gameSessionStatusEnum = pgEnum("game_session_status", [
  "recording",
  "processing",
  "ready",
]);

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 255 }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    status: gameSessionStatusEnum("status").notNull().default("recording"),
    audioPath: varchar("audio_path", { length: 1024 }),
    duration: integer("duration"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("game_sessions_campaign_id_idx").on(table.campaignId),
    index("game_sessions_created_by_idx").on(table.createdBy),
    index("game_sessions_status_idx").on(table.status),
  ]
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),

    content: text("content").notNull(),
    segments: jsonb("segments").$type<TranscriptSegment[]>().default([]),
    markers: jsonb("markers").$type<TranscriptMarker[]>().default([]),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("transcripts_session_id_idx").on(table.sessionId)]
);

export type GameSessionRow = typeof gameSessions.$inferSelect;
export type NewGameSession = typeof gameSessions.$inferInsert;
export type GameSessionStatus =
  (typeof gameSessionStatusEnum.enumValues)[number];
export type TranscriptRow = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
