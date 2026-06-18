# JobPilot

**A human-in-the-loop job application copilot.** JobPilot helps you find, review,
prepare, and track job applications — it **never auto-applies**, bypasses CAPTCHAs,
scrapes restricted boards, or impersonates a human candidate.

The workflow is deliberately manual at the moment that matters:

1. Import jobs from safe/allowed sources (Gmail job alerts, manual paste/upload, compliant career-page feeds).
2. See them in your own dashboard.
3. Score each job against your resume, location, skills, and career goals (AI-assisted, with a deterministic fallback).
4. Generate tailored application material (resume notes, cover letter, screening answers).
5. Click **Apply on original site** — JobPilot opens the official URL in a new tab.
6. **You** review and submit the application yourself.
7. JobPilot tracks status, reminders, and outcomes.

> JobPilot is a copilot, not an auto-apply bot. See [docs/SECURITY.md](docs/SECURITY.md)
> for the full compliance posture.

---

## Stack

| Layer    | Choice |
|----------|--------|
| Web      | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn-style UI |
| API      | Fastify, TypeScript, Zod validation |
| Worker   | BullMQ on Redis (Gmail import + scoring queues) |
| DB       | PostgreSQL + Drizzle ORM |
| Shared   | `packages/shared` (Zod schemas + types), `packages/core` (scoring, parsing, AI) |
| AI       | Provider abstraction — Anthropic Claude / OpenAI / deterministic heuristic |
| Infra    | pnpm workspaces monorepo, Docker Compose (Postgres + Redis) |

## Monorepo layout

```
apps/
  web/        Next.js front-end (dashboard, jobs, tracker, import, settings)
  api/        Fastify REST API (auth, jobs, scoring, documents, tracker)
  worker/     BullMQ background workers (gmail import, async scoring)
packages/
  shared/     Zod schemas + shared TypeScript types (single source of truth)
  db/         Drizzle schema, migrations, typed DB client
  core/       Scoring engine, Melbourne location data, job-text parsing, AI provider
docs/         Design deliverables (PRD, architecture, schema, API, prompts, security...)
legacy/       Previous Python prototype (reference only)
```

## Quick start (dev)

```bash
# 1. Install deps
pnpm install

# 2. Start Postgres + Redis (requires Docker)
docker compose up -d

# 3. Configure environment
cp .env.example .env        # fill in secrets (see docs/ARCHITECTURE.md)

# 4. Create the database schema
pnpm db:push                # or: pnpm db:migrate

# 5. Seed your profile + sample jobs
pnpm db:seed

# 6. Run everything
pnpm dev                    # web :3000, api :4000, worker

# Type-check / build the whole monorepo
pnpm typecheck
pnpm build
```

No Docker yet? Point `DATABASE_URL` at any Postgres instance and `REDIS_URL` at any
Redis (the worker/queues degrade gracefully — synchronous scoring still works without Redis).

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/PRD.md](docs/PRD.md) | Product requirements, personas, workflow map, risks & mitigations |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical architecture, repo structure, env vars |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Full database schema |
| [docs/API.md](docs/API.md) | REST API route design |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Pages & component plan |
| [docs/PROMPTS.md](docs/PROMPTS.md) | AI prompt plan (extraction, scoring, generation) |
| [docs/GMAIL_IMPORT.md](docs/GMAIL_IMPORT.md) | Gmail OAuth + import logic |
| [docs/SECURITY.md](docs/SECURITY.md) | Security, privacy & compliance plan |
| [docs/MILESTONES.md](docs/MILESTONES.md) | MVP milestone plan (phases 1–6) |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Step-by-step build tasks + test plan |

## Status

- **Phase 1 (foundation)** ✅ — auth, DB, manual import, dashboard, job detail, tracker.
- **Phase 2 (AI scoring)** ✅ — Claude-backed job extraction + scoring (Anthropic SDK,
  structured outputs, Zod-validated, deterministic fallback). Set `AI_PROVIDER=anthropic`
  and `ANTHROPIC_API_KEY` to enable; the app runs fully on the heuristic engine without a key.
- **Phase 3 (document generation)** ✅ — tailored resume notes, cover letters, screening
  answers, and interview prep per job, behind the same provider (truthful by construction:
  job-required skills you lack are flagged "do not claim"). Markdown/text export.
- **Phase 4 (Gmail import)** ✅ — read-only OAuth (`gmail.readonly`), encrypted tokens,
  per-sender + generic alert parsers, deduped + auto-scored import. Setup/testing guide:
  [docs/GMAIL_SETUP.md](docs/GMAIL_SETUP.md).

See [docs/MILESTONES.md](docs/MILESTONES.md) for Phases 5–6 (production hardening, browser extension).
