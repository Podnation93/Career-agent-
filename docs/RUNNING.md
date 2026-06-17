# Running JobPilot locally

Verified startup for the monorepo (pnpm + Turbo, Next.js web + Fastify API +
BullMQ worker, Postgres + Redis via Docker).

## Prerequisites
- Node 20+ (tested on 22) and pnpm 11 (`corepack enable` if you don't have it)
- Docker (for Postgres + Redis)

## First-time setup
```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Create your env file (defaults already match docker-compose)
cp .env.example .env
#   Optional but recommended — set real secrets:
#     SESSION_SECRET   (openssl rand -base64 48)
#     ENCRYPTION_KEY   (openssl rand -base64 32)  # needed for Gmail tokens

# 3. Start Postgres + Redis
docker compose up -d

# 4. Create the database schema
pnpm db:migrate

# 5. (optional) seed sample data
pnpm db:seed
```

## Run it
```bash
pnpm dev
```
Turbo starts all three apps in parallel:
- Web  → http://localhost:3000
- API  → http://localhost:4000  (health: http://localhost:4000/api/health)
- Worker (BullMQ; idles if `REDIS_URL` is unset — the API then scores synchronously)

Open http://localhost:3000.

## Notes
- The web app talks to the API via `API_BASE_URL` (defaults to
  `http://localhost:4000`).
- `.env` is loaded by the API and worker via `--env-file-if-exists` and by the
  DB tooling via dotenv; defaults fall back to the `jobpilot` Postgres role that
  `docker-compose.yml` creates, so local runs work out of the box.
- Runs fully without any AI key (`AI_PROVIDER=heuristic`). Set
  `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` for AI-assisted scoring and
  document generation; it falls back to the deterministic engine on any error.
- Gmail import is read-only and optional — see `docs/GMAIL_SETUP.md`.

## Useful scripts
| Command | What it does |
|---|---|
| `pnpm dev` | Run web + api + worker (Turbo, parallel) |
| `pnpm typecheck` | Typecheck every package |
| `pnpm test` | Run tests |
| `pnpm db:migrate` | Apply DB migrations |
| `pnpm db:seed` | Seed sample data |
| `pnpm db:generate` | Generate a new migration from schema changes |
