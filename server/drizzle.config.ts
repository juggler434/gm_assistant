// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/*[!x].ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://gm_user:gm_password@localhost:5432/gm_assistant",
  },
  verbose: true,
  strict: true,
});
