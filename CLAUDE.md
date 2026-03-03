# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Commits

Do **not** add a `Co-Authored-By` line to commit messages.

## Project Overview

GM Assistant is an AI-powered RPG Game Master campaign management tool. It is structured as an **npm workspaces monorepo** with three packages:

- **`shared/`** — Common TypeScript types and constants shared between client and server
- **`server/`** — Node.js/TypeScript backend (Fastify API, PostgreSQL, Redis, S3)
- **`client/`** — React/TypeScript frontend (Vite, Tailwind CSS v4, shadcn/ui)

Features include user authentication (session cookies), campaign CRUD, document upload/processing, a RAG pipeline for answering questions from campaign documents, and analytics via PostHog.

## Monorepo Structure

```
gm_assistant/
├── package.json              # Workspace root (npm workspaces)
├── CLAUDE.md
├── docker-compose.yml
├── mockups/
│   └── gm-assistant-mockup.html   # Interactive HTML/CSS design reference
├── shared/                   # @gm-assistant/shared package
│   ├── src/
│   │   ├── index.ts          # Barrel exports
│   │   ├── entities.ts       # User, Campaign, Document types
│   │   ├── api.ts            # API request/response types
│   │   ├── query.ts          # Query-related types
│   │   ├── generation.ts     # LLM generation types
│   │   └── common.ts         # Shared constants (SUPPORTED_MIME_TYPES, etc.)
│   └── tsconfig.json
├── client/                   # React frontend
│   └── (see Client section below)
└── server/                   # Fastify backend
    └── (see Server section below)
```

## Development Commands

### Server (from `server/` directory)

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

### Client (from `client/` directory)

```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Type-check + Vite production build
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run preview      # Preview production build
```

### Shared (from `shared/` directory)

```bash
npm run build        # Compile TypeScript (outputs to dist/)
npm run typecheck    # Type-check without emitting
```

### Root

```bash
npm install          # Install all workspace dependencies (run from root)
```

**Important:** The shared package must be built (`cd shared && npm run build`) before the client can type-check or build, since the client imports from `@gm-assistant/shared` via its compiled `dist/` output.

## Client Architecture

### Tech Stack

- **React 19** with **TypeScript** (strict mode)
- **Vite 7** for bundling and dev server
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin
- **shadcn/ui** (new-york style) with Radix UI primitives
- **TanStack React Query** for server state management
- **React Router v7** for client-side routing
- **Lucide React** for icons

### Client Directory Structure

```
client/src/
├── main.tsx                    # Entry point (renders App into DOM)
├── App.tsx                     # Root component (providers, router, Toaster)
├── index.css                   # Tailwind imports + dark fantasy theme tokens
├── vite-env.d.ts
├── components/
│   └── ui/                     # Reusable UI component library
│       ├── button.tsx          # Button (6 variants, 4 sizes)
│       ├── input.tsx           # Text input
│       ├── textarea.tsx        # Multi-line text input
│       ├── label.tsx           # Form label (Radix-based)
│       ├── select.tsx          # Dropdown select (Radix-based)
│       ├── dialog.tsx          # Modal dialog (Radix-based)
│       ├── card.tsx            # Card with header/title/description/content/footer
│       ├── badge.tsx           # Badge/tag (6 variants)
│       ├── spinner.tsx         # Loading spinner (animated SVG)
│       ├── skeleton.tsx        # Skeleton loaders (base + card + table row)
│       ├── sonner.tsx          # Toast notification provider (Sonner)
│       ├── empty-state.tsx     # Empty state placeholder
│       └── error-state.tsx     # Error state with retry
├── pages/
│   └── home.tsx                # Landing page
├── lib/
│   └── utils.ts                # cn() helper (clsx + tailwind-merge)
└── types/
    └── index.ts                # Re-exports from @gm-assistant/shared
```

### UI Component Library

All components live in `client/src/components/ui/` and follow the [shadcn/ui](https://ui.shadcn.com/) pattern: unstyled Radix primitives + Tailwind classes + `class-variance-authority` for variants.

#### Component Reference

| Component | File | Variants / Notes |
|-----------|------|-----------------|
| **Button** | `button.tsx` | Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default`, `sm`, `lg`, `icon`. Supports `asChild` via Radix Slot. |
| **Input** | `input.tsx` | Standard text input. Styled with focus ring on primary color. |
| **Textarea** | `textarea.tsx` | Multi-line input, resizable, 80px min-height. |
| **Label** | `label.tsx` | Radix Label for accessible form fields. |
| **Select** | `select.tsx` | Full Radix Select: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`. Keyboard-navigable. |
| **Dialog** | `dialog.tsx` | Radix Dialog: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`. Focus-trapped with overlay. |
| **Card** | `card.tsx` | Composable: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. |
| **Badge** | `badge.tsx` | Variants: `default` (purple), `secondary`, `destructive`, `success`, `warning`, `outline`. Pill-shaped. |
| **Spinner** | `spinner.tsx` | Animated SVG arc. Props: `label` (screen reader text). Uses `role="status"`. |
| **Skeleton** | `skeleton.tsx` | `Skeleton` (base pulse), `CardSkeleton` (campaign card shape), `TableRowSkeleton` (document row shape). All `aria-hidden`. |
| **Toaster** | `sonner.tsx` | Sonner-based toast provider. Already wired into `App.tsx`. Use `import { toast } from "sonner"` to trigger. |
| **EmptyState** | `empty-state.tsx` | Props: `icon`, `heading`, `description`, `action`. Uses `role="status"`, dashed border. |
| **ErrorState** | `error-state.tsx` | Props: `heading`, `description`, `onRetry`, `icon`. Uses `role="alert"`, destructive border. |

#### Adding New shadcn/ui Components

The project uses shadcn/ui's `components.json` configuration (new-york style, Lucide icons, CSS variables). To add a new component manually:

1. Create the file in `client/src/components/ui/`
2. Use `cn()` from `@/lib/utils` for className merging
3. Use `cva()` from `class-variance-authority` for variants
4. Install any required Radix primitive (e.g. `npm install @radix-ui/react-tooltip` from root)

### Design Theme

The client uses an **always-dark fantasy theme** defined in `client/src/index.css`. Color tokens are mapped from the mockup's CSS custom properties:

| Role | CSS Variable | Hex Equivalent | Usage |
|------|-------------|----------------|-------|
| Background | `--color-background` | `#0f0f14` | Page background (darkest) |
| Card | `--color-card` | `#1e1e28` | Cards, inputs, popovers |
| Secondary | `--color-secondary` | `#282834` | Secondary buttons, muted areas |
| Accent | `--color-accent` | `#353544` | Hover backgrounds |
| Border | `--color-border` | `#3a3a4a` | All borders and dividers |
| Primary | `--color-primary` | `#a855f7` | Purple accent (buttons, links, focus rings) |
| Foreground | `--color-foreground` | `#e8e6e3` | Primary text |
| Muted fg | `--color-muted-foreground` | `#9d9baf` | Secondary text |
| Destructive | `--color-destructive` | `#ef4444` | Error states, delete actions |
| Success | `--color-success` | `#22c55e` | Success badges, positive indicators |
| Warning | `--color-warning` | `#f59e0b` | Warning badges, caution states |
| Sidebar | `--color-sidebar` | `#16161d` | Sidebar background |

### Client Path Aliases

- `@/*` → `./src/*` (configured in both `tsconfig.app.json` and `vite.config.ts`)

### Client Proxy

The Vite dev server proxies `/api` requests to `http://localhost:3000` (the Fastify server).

## Mockups

The `mockups/gm-assistant-mockup.html` file is an interactive HTML/CSS reference for the frontend design. Open it in a browser to view six screens:

1. **Login** — Centered auth card with email/password form
2. **Register** — Similar to login with name field
3. **Dashboard** — Sidebar layout, stats row, campaign card grid
4. **Campaign Detail** — Document table with tabs, search, upload button
5. **AI Query** — Three-panel chat layout (history sidebar, chat, context panel)
6. **Upload Modal** — Overlay dialog with drag-and-drop zone, document type select, tags input

Use this mockup as the source of truth for component styling, spacing, and color palette.

## Server Architecture

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

### Server Path Aliases

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

- **LLM Service** — Factory pattern with provider interface. Ollama provider implemented (default model: gemma3:1b). Used for RAG response generation.
- **Storage Service** — Factory pattern with provider interface. S3 provider implemented (connects to MinIO locally). Used for document file storage.
- **Metrics Service** — PostHog integration. Tracks events (user_registered, document_uploaded, etc.). All operations are no-ops when `POSTHOG_API_KEY` is not set, so the app runs without it.

## Background Jobs

Document processing uses **BullMQ** with Redis. When a document is uploaded, a `document-processing` job is queued. The worker extracts text (PDF/plain text), chunks it, generates embeddings, and stores chunks with vectors in the database.

## Testing

- **Runner:** Vitest
- **Location:** `server/tests/`, mirroring the `src/` structure
- **Route tests** use `app.inject()` with mocked dependencies
- **Test factories** in `tests/factories/` for generating test data

## Configuration

Environment variables are managed through `config/index.ts`. See `.env.example` for required variables:
- PostgreSQL database connection
- Redis for job queues
- S3-compatible storage (MinIO)
- LLM settings (default: Ollama with gemma3:1b)
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
| Vite       | 5173  | Frontend dev server            |
| Fastify    | 3000  | Backend API server             |

### Default Credentials

See `.env.example` for connection strings. Copy to `.env` for local development.

## Technical Requirements

- Node.js 20.0.0+
- Docker and Docker Compose
- ES modules (type: "module")
- TypeScript strict mode enabled
