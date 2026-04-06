# ============================================
# GM Assistant - Docker Build
# ============================================

# ---- Build stage ----
FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install all dependencies (dev deps needed for build tools)
RUN npm ci

# Build shared package (required by both client and server)
COPY shared/ shared/
RUN npm run build --workspace=shared

# Build server (compiled JS used for drizzle-kit push)
COPY server/ server/
RUN npm run build --workspace=server

# Build client (produces static files in client/dist/)
COPY client/ client/
RUN npm run build --workspace=client

# ---- Runtime stage ----
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install all dependencies (tsx needed to run server from source)
RUN npm ci && apk del python3 make g++

# Copy built shared package
COPY --from=build /app/shared/dist shared/dist
COPY shared/package.json shared/package.json
COPY shared/tsconfig.json shared/tsconfig.json

# Copy server source (tsx runs TypeScript directly)
COPY server/src server/src
COPY server/tsconfig.json server/tsconfig.json
COPY server/drizzle server/drizzle
COPY server/drizzle.config.ts server/drizzle.config.ts
COPY server/drizzle-docker.config.ts server/drizzle-docker.config.ts

# Copy compiled server (used by drizzle-kit push)
COPY --from=build /app/server/dist server/dist

# Copy built client static files
COPY --from=build /app/client/dist client/dist

# Copy entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
