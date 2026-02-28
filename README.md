# GM Assistant

An AI-powered RPG Game Master campaign management tool. Features include user authentication, campaign CRUD, document upload/processing, a RAG pipeline for answering questions from campaign documents, AI content generation, and persistent conversation history.

## License

This project is licensed under [AGPL-3.0-or-later](LICENSE).

## Tested LLM

The app has been tested with **Google Gemini 2.5 Flash**. Set `LLM_PROVIDER=google` and provide a `GOOGLE_AI_API_KEY` in your `.env` to use it. Other providers (e.g. Ollama) are supported but may require additional tuning.

## Prerequisites

- [Node.js](https://nodejs.org/) v20.0.0 or higher
- [Docker](https://www.docker.com/) and Docker Compose

## Project Structure

```
gm_assistant/
├── package.json                # Workspace root (npm workspaces)
├── docker-compose.yml          # Local infrastructure services
├── shared/                     # @gm-assistant/shared — common types and constants
│   ├── src/
│   │   ├── index.ts            # Barrel exports
│   │   ├── entities.ts         # User, Campaign, Document types
│   │   ├── api.ts              # API request/response types
│   │   ├── query.ts            # Query-related types
│   │   ├── generation.ts       # LLM generation types
│   │   └── common.ts           # Shared constants
│   └── tsconfig.json
├── server/                     # Node.js/TypeScript backend (Fastify, PostgreSQL, Redis, S3)
│   ├── src/
│   │   ├── index.ts            # Entry point
│   │   ├── app.ts              # Fastify app builder
│   │   ├── config/             # Environment configuration
│   │   ├── db/                 # Drizzle ORM client, schema, migrations
│   │   ├── modules/
│   │   │   ├── auth/           # Authentication (register, login, sessions)
│   │   │   ├── campaigns/      # Campaign CRUD
│   │   │   ├── conversations/  # Persistent conversation history
│   │   │   ├── documents/      # Document upload & management
│   │   │   ├── generation/     # AI content generation (adventure hooks)
│   │   │   ├── knowledge/      # Knowledge base & retrieval
│   │   │   ├── query/          # RAG pipeline
│   │   │   └── metrics/        # Admin metrics endpoint
│   │   ├── services/
│   │   │   ├── llm/            # LLM service (Ollama + Gemini providers)
│   │   │   ├── storage/        # S3-compatible storage (MinIO)
│   │   │   └── metrics/        # PostHog analytics
│   │   ├── jobs/               # BullMQ background job system
│   │   ├── plugins/            # Fastify plugins (CORS, rate-limit, etc.)
│   │   └── types/              # Shared TypeScript types
│   └── tests/
├── client/                     # React/TypeScript frontend (Vite, Tailwind CSS v4, shadcn/ui)
│   └── src/
│       ├── main.tsx            # Entry point
│       ├── App.tsx             # Root component (providers, router)
│       ├── index.css           # Tailwind imports + theme tokens
│       ├── components/
│       │   ├── ui/             # Reusable UI component library (shadcn/ui)
│       │   ├── auth/           # Auth guards
│       │   ├── campaigns/      # Campaign cards, forms, dialogs
│       │   ├── citations/      # Source citation display
│       │   ├── documents/      # Document list, details, filters
│       │   ├── generation/     # Adventure hook generator UI
│       │   ├── layouts/        # App layout, sidebar, header
│       │   └── query/          # Chat interface, context panel
│       ├── pages/              # Route pages
│       ├── lib/                # Utilities
│       └── types/              # Type re-exports
└── mockups/
    └── gm-assistant-mockup.html  # Interactive HTML/CSS design reference
```

## Getting Started

### 1. Install dependencies

From the project root:

```bash
npm install
```

This installs dependencies for all three workspace packages (shared, client, server).

### 2. Build the shared package

The shared package must be built before the client or server can use it:

```bash
cd shared && npm run build
```

### 3. Start infrastructure services

From the project root, start PostgreSQL, Redis, MinIO, Ollama, and OCR with Docker Compose:

```bash
docker-compose up -d
```


#### Service ports

| Service    | Port  | Description                 |
|------------|-------|-----------------------------|
| PostgreSQL | 5432  | Database (pgvector enabled) |
| Redis      | 6379  | Job queue and caching       |
| MinIO      | 9000  | S3-compatible storage API   |
| MinIO      | 9001  | MinIO web console           |
| Ollama     | 11434 | LLM API                     |
| OCR        | 8080  | PDF to Text conversion API  |

### 4. Configure environment variables

Copy the example env file and adjust values as needed:

```bash
cp .env.example server/.env
```

The defaults in `.env.example` match the Docker Compose service credentials, so no changes are required for local development.

The `LLM_PROVIDER` variable controls which LLM backend is used (`ollama` or `google`). When using Google, set `GOOGLE_AI_API_KEY` as well.

### 5. Set up the database

```bash
cd server && npm run db:setup && npm run db:push
```

### 6. Run the app

Start the backend and frontend dev servers in separate terminals:

```bash
# Terminal 1 — Server (runs on port 3000)
cd server
npm run dev

# Terminal 2 — Client (runs on port 5173)
cd client
npm run dev
```

The Vite dev server proxies `/api` requests to the Fastify backend at `http://localhost:3000`.

Open [http://localhost:5173/register](http://localhost:5173/register) in your browser to create your account and get started.

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/auth/me` | Yes | Get current user |
| POST | `/api/auth/logout` | Yes | Logout |
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
| POST | `/api/campaigns/:campaignId/query` | Yes | RAG query against campaign documents |
| POST | `/api/campaigns/:campaignId/generate/hooks` | Yes | Generate adventure hooks |
| GET | `/api/campaigns/:campaignId/conversations` | Yes | List conversations |
| POST | `/api/campaigns/:campaignId/conversations` | Yes | Create conversation |
| GET | `/api/campaigns/:campaignId/conversations/:id` | Yes | Get conversation with messages |
| POST | `/api/campaigns/:campaignId/conversations/:id/messages` | Yes | Add message to conversation |
| DELETE | `/api/campaigns/:campaignId/conversations/:id` | Yes | Delete conversation |
| GET | `/api/admin/metrics` | Yes | Aggregated app metrics |

## Available Scripts

### Server (`server/`)

| Command              | Description                      |
|----------------------|----------------------------------|
| `npm run dev`        | Start dev server with hot reload |
| `npm run build`      | Compile TypeScript               |
| `npm start`          | Run compiled app                 |
| `npm test`           | Run tests                        |
| `npm run test:watch` | Run tests in watch mode          |
| `npm run lint`       | Run ESLint                       |
| `npm run lint:fix`   | Auto-fix lint issues             |
| `npm run format`     | Format with Prettier             |
| `npm run typecheck`  | Type-check without building      |
| `npm run db:push`    | Push schema to database          |
| `npm run db:generate`| Generate migrations              |
| `npm run db:migrate` | Run migrations                   |
| `npm run db:studio`  | Open Drizzle Studio              |

### Client (`client/`)

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm run dev`        | Start Vite dev server (port 5173)    |
| `npm run build`      | Type-check + Vite production build   |
| `npm run lint`       | Run ESLint                           |
| `npm run format`     | Format with Prettier                 |
| `npm run preview`    | Preview production build             |

### Shared (`shared/`)

| Command              | Description                       |
|----------------------|-----------------------------------|
| `npm run build`      | Compile TypeScript (outputs to dist/) |
| `npm run typecheck`  | Type-check without emitting       |

## Stopping Services

```bash
# Stop Docker services
docker-compose down

# Stop and remove all data volumes
docker-compose down -v
```
