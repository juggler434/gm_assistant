import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { users, type User, type NewUser } from "@/db/schema/index.js";

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
