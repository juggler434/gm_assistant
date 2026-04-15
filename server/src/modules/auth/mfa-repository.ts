// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { userMfa, type UserMfa } from "@/db/schema/index.js";

/** Find the MFA row for a user (enabled or still in setup). */
export async function findUserMfa(userId: string): Promise<UserMfa | null> {
  const result = await db
    .select()
    .from(userMfa)
    .where(eq(userMfa.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Upsert the pending TOTP secret for a user during setup.
 * enabledAt stays NULL until the user confirms with a valid TOTP code.
 * Recovery codes are (re)set only at enable time.
 */
export async function upsertPendingSecret(
  userId: string,
  secretEncrypted: string
): Promise<UserMfa | null> {
  const result = await db
    .insert(userMfa)
    .values({ userId, secretEncrypted, enabledAt: null, recoveryCodesHash: [] })
    .onConflictDoUpdate({
      target: userMfa.userId,
      set: { secretEncrypted, enabledAt: null, recoveryCodesHash: [] },
    })
    .returning();
  return result[0] ?? null;
}

/** Mark the user's MFA row as enabled and store the hashed recovery codes. */
export async function enableMfa(
  userId: string,
  recoveryCodesHash: string[]
): Promise<UserMfa | null> {
  const result = await db
    .update(userMfa)
    .set({ enabledAt: new Date(), recoveryCodesHash })
    .where(eq(userMfa.userId, userId))
    .returning();
  return result[0] ?? null;
}

/** Delete the MFA row for a user (disable). */
export async function disableMfa(userId: string): Promise<boolean> {
  const result = await db
    .delete(userMfa)
    .where(eq(userMfa.userId, userId))
    .returning({ id: userMfa.id });
  return result.length > 0;
}

/**
 * Atomically remove a single recovery-code hash from the user's array.
 * Returns true if the hash was present (and thus consumed), false otherwise.
 */
export async function consumeRecoveryCodeHash(
  userId: string,
  hash: string
): Promise<boolean> {
  const result = await db
    .update(userMfa)
    .set({
      recoveryCodesHash: sql`array_remove(${userMfa.recoveryCodesHash}, ${hash})`,
    })
    .where(
      sql`${userMfa.userId} = ${userId} AND ${hash} = ANY(${userMfa.recoveryCodesHash})`
    )
    .returning({ id: userMfa.id });
  return result.length > 0;
}
