/* eslint-disable no-console */
/**
 * Database setup script
 * Run this once to initialize the database with required extensions
 */
import postgres from "postgres";
import { config } from "@/config/index.js";

async function setup() {
  console.log("Setting up database...\n");

  const sql = postgres(config.database.url, { max: 1 });

  try {
    // Enable pgvector extension for vector similarity search
    console.log("Enabling pgvector extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log("  ✓ pgvector extension enabled\n");

    // Enable uuid-ossp for UUID generation (optional, PostgreSQL has gen_random_uuid())
    console.log("Enabling uuid-ossp extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    console.log("  ✓ uuid-ossp extension enabled\n");

    console.log("Database setup complete!");
  } catch (error) {
    console.error("Database setup failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

setup();
