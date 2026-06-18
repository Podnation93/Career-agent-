# JobPilot — Technical Architecture

## 1. High-level

```
                    ┌─────────────────────────────────────────┐
   Browser ───────▶ │  apps/web  (Next.js 15, App Router)      │
                    │  • Server Components for data fetching    │
                    │  • Route Handlers proxy to API when useful│
                    └───────────────┬─────────────────────────┘
                                    │ HTTPS (JSON, cookie session)
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  apps/api  (Fastify, TypeScript)         │
                    │  • Auth (session cookies)                 │
                    │  • REST: jobs, profile, scoring, docs,    │
                    │    tracker, import, gmail, settings       │
                    │  • Zod validation on every route          │
                    └───┬──────────────┬───────────────┬───────┘
                        │              │               │
            ┌───────────▼───┐   ┌──────▼──────┐  ┌─────▼─────────┐
            │ packages/db    │   │ packages/   │  │  Redis +      │
            │ (Drizzle+PG)   │   │ core        │  │  BullMQ       │
            │                │   │ scoring/AI/ │  │ (enqueue jobs)│
            │                │   │ parsing/loc │  └─────┬─────────┘
            └───────────────┘   └─────────────┘        │
                                                        ▼
                                            ┌───────────────────────┐
                                            │  apps/worker (BullMQ)  │
                                            │  • gmail-import queue   │
                                            │  • scoring queue        │
                                            │  → uses core + db       │
                                            └───────────┬───────────┘
                                                        │ read-only
                                                        ▼
                                              ┌───────────────────┐
                                              │  Gmail API (OAuth) │
                                              │  scope: readonly    │
                                              └───────────────────┘

   AI provider (packages/core/ai): Anthropic | OpenAI | heuristic — selected at runtime.
```

## 2. Why this shape (decisions & trade-offs)

- **Split Next.js + Fastify (not Next-only):** clean separation of UI and a reusable
  REST API that the future browser extension and worker can call. Trade-off: two
  services to run in dev — mitigated by a single `pnpm dev` (Turbo/concurrently).
- **Drizzle over Prisma:** SQL-first, thin runtime, fast migrations, no codegen daemon;
  the schema is plain TypeScript reused across api/worker.
- **BullMQ + Redis worker:** Gmail import and (optionally) scoring run off the request
  path. Trade-off: Redis dependency — the API degrades to synchronous scoring if Redis
  is absent, so the app still works without it.
- **AI provider abstraction with heuristic default:** zero-key local dev, deterministic
  tests, graceful degradation, and easy provider swap. Claude (`claude-sonnet-4-6`) is
  the recommended hosted default.
- **`user_id` on every owned row:** single-user today, multi-user-ready with no schema churn.

## 3. Repository structure

```
jobpilot/
├─ apps/
│  ├─ web/
│  │  ├─ src/app/                 # App Router pages
│  │  │  ├─ (dashboard)/page.tsx  # overview
│  │  │  ├─ jobs/page.tsx         # job list + filters
│  │  │  ├─ jobs/[id]/page.tsx    # job detail + Apply
│  │  │  ├─ import/page.tsx       # manual + gmail import
│  │  │  ├─ tracker/page.tsx      # kanban/table
│  │  │  ├─ documents/page.tsx
│  │  │  ├─ profile/page.tsx
│  │  │  ├─ settings/page.tsx
│  │  │  ├─ login/page.tsx
│  │  │  └─ layout.tsx
│  │  ├─ src/components/          # ui/, jobs/, tracker/, layout/
│  │  ├─ src/lib/                 # api client, formatters
│  │  └─ next.config.ts, tailwind, tsconfig
│  ├─ api/
│  │  ├─ src/routes/              # auth, jobs, profile, scoring, documents, tracker, import, gmail, settings
│  │  ├─ src/plugins/            # auth, db, error-handler, rate-limit
│  │  ├─ src/lib/                # session, crypto, env
│  │  └─ src/server.ts
│  └─ worker/
│     ├─ src/queues/             # gmail-import, scoring
│     └─ src/index.ts
├─ packages/
│  ├─ shared/  src/              # zod schemas, enums, DTO types
│  ├─ db/      src/              # schema.ts, client.ts, migrations/, seed.ts
│  └─ core/    src/              # scoring/, location/, parsing/, ai/, dedupe/
├─ docs/
├─ legacy/                        # Python prototype (reference)
├─ docker-compose.yml
├─ .env.example
├─ package.json                   # workspace root scripts
├─ pnpm-workspace.yaml
├─ turbo.json
└─ tsconfig.base.json
```

## 4. Environment variables

See `.env.example`. Summary:

| Var | Used by | Notes |
|-----|---------|-------|
| `DATABASE_URL` | db/api/worker | `postgres://user:pass@localhost:5432/jobpilot` |
| `REDIS_URL` | api/worker | optional; queues disabled if unset |
| `API_PORT` | api | default 4000 |
| `WEB_PORT` | web | default 3000 |
| `API_BASE_URL` | web | e.g. `http://localhost:4000` |
| `SESSION_SECRET` | api | ≥32 bytes; signs session cookies |
| `ENCRYPTION_KEY` | api/worker | 32-byte base64; AES-256-GCM for OAuth tokens |
| `AI_PROVIDER` | core | `heuristic` \| `anthropic` \| `openai` |
| `ANTHROPIC_API_KEY` | core | when `AI_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | core | default `claude-sonnet-4-6` |
| `OPENAI_API_KEY` | core | when `AI_PROVIDER=openai` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api/worker | Gmail OAuth |
| `GOOGLE_REDIRECT_URI` | api | `http://localhost:4000/api/gmail/callback` |
| `NODE_ENV` | all | `development` \| `production` |

**Secrets never get committed.** `.env` is git-ignored; only `.env.example` is tracked.

## 5. Data flow examples

**Manual import:** `POST /api/import/manual` → core parser extracts fields → dedupe →
insert `jobs` + `job_descriptions` → enqueue (or run) scoring → returns job id.

**Gmail import:** user connects (OAuth) → `POST /api/gmail/scan` enqueues `gmail-import`
→ worker lists matching messages (read-only) → per-sender parser → dedupe → insert →
enqueue scoring → progress polled via `GET /api/import/status`.

**Apply:** web opens `apply_url` in a new tab (`rel="noopener noreferrer"`) → user
confirms → `POST /api/tracker/:jobId/event` records `marked_applied` + status change.

## 6. Build & tooling
- **pnpm workspaces** + **Turborepo** for task orchestration and caching.
- **tsup** to build packages; **tsx** for dev; Next's own build for web.
- **Vitest** for unit tests (core/scoring/parsing/dedupe), **Supertest**-style Fastify `inject` for API.
- **ESLint + Prettier**, shared `tsconfig.base.json` with path aliases (`@jobpilot/*`).
