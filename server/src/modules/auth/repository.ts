// SPDX-License-Identifier: AGPL-3.0-or-later

import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
  users,
  authIdentities,
  type User,
  type NewUser,
  type AuthIdentity,
} from "@/db/schema/index.js";

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function createUser(
  data: Pick<NewUser, "email" | "passwordHash" | "name">
): Promise<User | null> {
  const result = await db.insert(users).values(data).returning();
  return result[0] ?? null;
}

/**
 * Find an existing auth identity for a provider + providerAccountId pair.
 */
export async function findAuthIdentity(
  provider: string,
  providerAccountId: string
): Promise<AuthIdentity | null> {
  const result = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, provider),
        eq(authIdentities.providerAccountId, providerAccountId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

/**
 * Create an auth identity linking a user to a provider account.
 */
export async function createAuthIdentity(
  userId: string,
  provider: string,
  providerAccountId: string
): Promise<AuthIdentity | null> {
  const result = await db
    .insert(authIdentities)
    .values({ userId, provider, providerAccountId })
    .returning();
  return result[0] ?? null;
}

/**
 * Create a user with no password (OAuth-only) and link them to a provider
 * identity in the same transaction. The new user's email is pre-verified
 * because the OAuth provider has already asserted email ownership.
 */
export async function createOAuthUser(params: {
  email: string;
  name: string;
  provider: string;
  providerAccountId: string;
}): Promise<User | null> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({
        email: params.email,
        name: params.name,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      })
      .returning();
    const user = inserted[0];
    if (!user) return null;

    await tx.insert(authIdentities).values({
      userId: user.id,
      provider: params.provider,
      providerAccountId: params.providerAccountId,
    });

    return user;
  });
}

export async function markEmailVerified(userId: string): Promise<User | null> {
  const result = await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return result[0] ?? null;
}

export async function updatePassword(
  userId: string,
  passwordHash: string
): Promise<User | null> {
  const result = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .returning();
  return result[0] ?? null;
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  const result = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0]?.emailVerifiedAt !== null && result[0]?.emailVerifiedAt !== undefined;
}
