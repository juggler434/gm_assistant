// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const userMfa = pgTable(
  "user_mfa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // AES-256-GCM ciphertext of the base32 TOTP secret. Format: iv:authTag:ciphertext (all hex).
    secretEncrypted: varchar("secret_encrypted", { length: 512 }).notNull(),
    // NULL until the user confirms their first TOTP code during setup.
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    // SHA-256 hex hashes of single-use recovery codes. Codes are removed as they are consumed.
    recoveryCodesHash: varchar("recovery_codes_hash", { length: 64 })
      .array()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("user_mfa_user_id_idx").on(table.userId)]
);

export type UserMfa = typeof userMfa.$inferSelect;
export type NewUserMfa = typeof userMfa.$inferInsert;
