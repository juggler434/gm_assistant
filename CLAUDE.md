# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GM Assistant is an AI-powered RPG Game Master campaign management tool. It's a Node.js/TypeScript backend server with a Fastify-based API. Features include user authentication (session cookies), campaign CRUD, document upload/processing, a RAG pipeline for answering questions from campaign documents, and analytics via PostHog.

## Development Commands

All commands run from the `server/` directory:

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm start            # Run compiled app
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format with Prettier
npm run typecheck    # Type check without building
```

## Architecture

### Directory Structure

```
server/src/
├── index.ts                    # Entry point (starts server + worker)
├── app.ts                      # Fastify app builder (registers plugins & routes)
├── config/                     # Environment configuration
├── db/
│   ├── index.ts                # Drizzle ORM client
│   ├── setup.ts                # Database setup/migrations
│   └── schema/                 # Drizzle schema definitions
│       ├── users.ts
│       ├── campaigns.ts
│       ├── documents.ts
│       └── chunks.ts           # pgvector embeddings (768 dimensions)
├── modules/
│   ├── auth/                   # Authentication (register, login, sessions)
│   │   ├── routes.ts           # POST /register, POST /login
│   │   ├── repository.ts       # User DB queries
│   │   ├── schemas.ts          # Zod validation schemas
│   │   ├── middleware.ts       # Auth plugin, requireAuth hook, CSRF
│   │   ├── session.ts          # Session creation/validation (Redis-backed)
│   │   └── types.ts
│   ├── campaigns/              # Campaign CRUD
│   │   ├── routes.ts           # POST/GET/PATCH/DELETE /
│   │   ├── repository.ts
│   │   └── schemas.ts
│   ├── documents/              # Document upload & management
│   │   ├── routes.ts           # Upload, list, get, download, delete
│   │   ├── repository.ts
│   │   ├── schemas.ts
│   │   └── processors/        # Text extraction (PDF, plain text)
│   ├── knowledge/              # Knowledge base & retrieval
│   │   ├── chunking/          # Text chunking service
│   │   └── retrieval/         # Vector search, keyword search, hybrid search
│   ├── query/                  # RAG pipeline (not yet exposed as a route)
│   │   └── rag/               # Embedding → search → context → LLM generation
│   └── metrics/                # Admin metrics endpoint (GET /)
├── services/
│   ├── llm/                    # LLM service (factory pattern, Ollama provider)
│   ├── storage/                # S3-compatible storage (factory pattern, S3/MinIO provider)
│   └── metrics/                # PostHog analytics (no-op when unconfigured)
├── jobs/                       # BullMQ background job system
│   ├── document-indexing.ts    # Document processing job handler
│   ├── queue.ts                # Queue creation helper
│   ├── worker.ts               # Job worker
│   └── connection.ts           # Redis connection for BullMQ
├── plugins/                    # Fastify plugins
│   ├── cors.ts
│   ├── rate-limit.ts
│   ├── multipart.ts            # File uploads
│   ├── websocket.ts
│   └── metrics.ts              # Request metrics plugin
└── types/                      # Shared TypeScript types (Result<T,E>)
```

### Module Pattern

Each module under `modules/` follows a consistent structure:
- `routes.ts` — Fastify route handlers
- `repository.ts` — Database queries (Drizzle ORM)
- `schemas.ts` — Zod validation schemas (validated via `.safeParse()`)
- `index.ts` — Public API re-exports

Protected routes use `app.addHook("preHandler", requireAuth)` to require authentication.

### Path Aliases

The project uses TypeScript path aliases for clean imports:
- `@/*` → `./src/*`
- `@/config/*`, `@/services/*`, `@/modules/*`, `@/db/*`, `@/jobs/*`, `@/plugins/*`, `@/types/*`

### Error Handling Pattern

Uses `Result<T, E>` discriminated union type for error handling (see `types/index.ts`). Functions return `ok(value)` or `err(error)` instead of throwing.

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login |
| POST | `/api/campaigns` | Yes | Create campaign |
| GET | `/api/campaigns` | Yes | List user's campaigns |
| GET | `/api/campaigns/:id` | Yes | Get campaign details |
| PATCH | `/api/campaigns/:id` | Yes | Update campaign |
| DELETE | `/api/campaigns/:id` | Yes | Delete campaign |
| POST | `/api/campaigns/:campaignId/documents` | Yes | Upload document (multipart) |
| GET | `/api/campaigns/:campaignId/documents` | Yes | List documents |
| GET | `/api/campaigns/:campaignId/documents/:id` | Yes | Get document details |
| GET | `/api/campaigns/:campaignId/documents/:id/download` | Yes | Get signed download URL |
| DELETE | `/api/campaigns/:campaignId/documents/:id` | Yes | Delete document |
| GET | `/api/admin/metrics` | Yes | Aggregated app metrics |

## Database

Uses **Drizzle ORM** with **PostgreSQL** + **pgvector** extension. Four tables:

- **users** — id, email, passwordHash, name, timestamps
- **campaigns** — id, userId (FK), name, description, timestamps
- **documents** — id, campaignId (FK), uploadedBy (FK), name, file metadata, status (pending/processing/ready/error), documentType, tags
- **chunks** — id, documentId (FK), campaignId (FK), content, embedding (vector(768)), chunkIndex, tokenCount, pageNumber, section, timestamps. Uses HNSW index for vector similarity search.

## RAG Pipeline

The query module implements a Retrieval-Augmented Generation pipeline (not yet wired to an API route):

1. **Embed** — Generate query embedding via Ollama (`nomic-embed-text`, 768 dimensions)
2. **Search** — Hybrid search combining vector similarity (70% weight) and keyword full-text search (30% weight)
3. **Context** — Build context from top-k chunks within a token budget
4. **Generate** — Send question + context to LLM for answer generation
5. **Return** — Answer with source citations, confidence score, and usage stats

## Key Services

- **LLM Service** — Factory pattern with provider interface. Ollama provider implemented (default model: llama3). Used for RAG response generation.
- **Storage Service** — Factory pattern with provider interface. S3 provider implemented (connects to MinIO locally). Used for document file storage.
- **Metrics Service** — PostHog integration. Tracks events (user_registered, document_uploaded, etc.). All operations are no-ops when `POSTHOG_API_KEY` is not set, so the app runs without it.

## Background Jobs

Document processing uses **BullMQ** with Redis. When a document is uploaded, a `document-processing` job is queued. The worker extracts text (PDF/plain text), chunks it, generates embeddings, and stores chunks with vectors in the database.

## Testing

- **Runner:** Vitest
- **Location:** `server/tests/`, mirroring the `src/` structure
- **Route tests** use `app.inject()` with mocked dependencies
- **Test factories** in `tests/factories/` for generating test data

### Known Issue: `posthog-node` in Tests

The `posthog-node` module fails to load in some test files (particularly route tests for auth, campaigns, and documents). Tests that mock `@/services/metrics/service.js` before importing the module under test avoid this issue. If you see `posthog-node` import errors in tests, ensure the metrics service is mocked.

## Configuration

Environment variables are managed through `config/index.ts`. See `.env.example` for required variables:
- PostgreSQL database connection
- Redis for job queues
- S3-compatible storage (MinIO)
- LLM settings (default: Ollama with llama3)
- Session configuration (cookie name, secret, max age)
- PostHog analytics (optional)

## Local Development Setup

Start required services with Docker Compose (from project root):

```bash
# Start core services (PostgreSQL, Redis, MinIO)
docker-compose up -d

# Include Ollama for local LLM (optional)
docker-compose --profile with-ollama up -d

# Stop services
docker-compose down

# Stop and remove volumes (reset data)
docker-compose down -v
```

### Service Ports

| Service    | Port  | Description                    |
|------------|-------|--------------------------------|
| PostgreSQL | 5432  | Database (pgvector enabled)    |
| Redis      | 6379  | Job queue and caching          |
| MinIO      | 9000  | S3-compatible API              |
| MinIO      | 9001  | Web console                    |
| Ollama     | 11434 | LLM API (optional profile)     |

### Default Credentials

See `.env.example` for connection strings. Copy to `.env` for local development.

## Technical Requirements

- Node.js 20.0.0+
- Docker and Docker Compose
- ES modules (type: "module")
- TypeScript strict mode enabled
