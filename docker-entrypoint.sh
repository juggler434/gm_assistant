#!/bin/sh
set -e

echo ""
echo "========================================="
echo "  GM Assistant - Starting"
echo "========================================="
echo ""

cd /app/server

# Run database extension setup (idempotent)
echo "[1/3] Setting up database extensions..."
npx tsx --tsconfig tsconfig.json src/db/setup.ts
echo "  Done."

# Run database schema push using compiled JS (idempotent)
echo "[2/3] Applying database schema..."
npx drizzle-kit push --force --config drizzle-docker.config.ts
echo "  Done."

# Start the server
echo "[3/3] Starting server..."
echo ""
exec npx tsx --tsconfig tsconfig.json src/index.ts
