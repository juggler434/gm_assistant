import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/config/index.js";
import * as schema from "./schema/index.js";

const connectionString = config.database.url;

// Connection for queries (pooled)
export const queryClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle instance with schema for relational queries
export const db = drizzle(queryClient, { schema });

// Export a function to close connections (for graceful shutdown)
export async function closeDatabase(): Promise<void> {
  await queryClient.end();
}

// Migration client (single connection, not pooled)
export function createMigrationClient() {
  const migrationClient = postgres(connectionString, { max: 1 });
  return drizzle(migrationClient);
}

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection check failed:", error);
    return false;
  }
}

// Enable pgvector extension (run once during setup)
export async function enablePgVector(): Promise<void> {
  await queryClient`CREATE EXTENSION IF NOT EXISTS vector`;
}

export type Database = typeof db;
