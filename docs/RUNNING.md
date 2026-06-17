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

## No Docker? Two options for Postgres

JobPilot needs Postgres (its schema uses Postgres-only features). Redis is
**optional** — leave `REDIS_URL` blank and the worker idles while the API scores
synchronously. Pick one of these instead of `docker compose up`:

### Option A — Install Postgres locally (Fedora)
```bash
sudo dnf install -y postgresql-server postgresql
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql

# Create the role + database the default .env expects:
sudo -u postgres psql -c "CREATE USER jobpilot WITH PASSWORD 'jobpilot';"
sudo -u postgres psql -c "CREATE DATABASE jobpilot OWNER jobpilot;"
```
The default `.env` (`DATABASE_URL=postgres://jobpilot:jobpilot@localhost:5432/jobpilot`)
already matches — no edits needed.

### Option B — Free hosted Postgres (zero install)
Create a free database at [neon.tech](https://neon.tech) (or Supabase), then put
its connection string in `.env`:
```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

Then for either option:
```bash
pnpm db:migrate     # create the schema
pnpm db:seed        # optional sample data
pnpm dev
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
