# JobPilot — MVP Milestone Plan

Each phase is shippable on its own. Phase 1 is a usable product.

## Phase 1 — Foundation  ✅ (this build)
- pnpm monorepo, TypeScript, Turbo, Docker Compose (Postgres + Redis), `.env.example`.
- `packages/shared` (Zod schemas + types), `packages/db` (Drizzle schema + migrations + seed).
- Local email/password **auth** (argon2id, signed session cookies, CSRF).
- **jobs** + descriptions + scores + skills tables; **manual import** (URL/text/file) with parsing + dedupe.
- Deterministic **scoring** (heuristic engine in `packages/core`) wired into import.
- **Dashboard**, **Jobs list** (filters/sort), **Job detail** with **Apply button**, **Tracker** (kanban + status events), **Profile**, **Settings** pages.
- Application tracker with statuses, events timeline, notes, reminders.
- **Exit criteria:** can register, set profile, paste a job, see it scored, review it, click Apply (opens original URL), and track it to an outcome.

## Phase 2 — AI scoring  ✅
- `packages/core/ai` provider abstraction (Anthropic/OpenAI/heuristic).
- Prompts P1 (extraction) + P2 (scoring) implemented via the Anthropic SDK with
  structured outputs (`client.beta.messages.parse` + `betaZodOutputFormat`),
  validated against the shared Zod schemas, with deterministic heuristic fallback
  on any error. Default model `claude-opus-4-8` (override with `ANTHROPIC_MODEL`).
- Scores stored in `job_scores`; UI shows category breakdown, matched/missing skills, risks.
- Provider selected by `AI_PROVIDER` env (per-user provider override is a later iteration).
- **Exit:** AI-scored jobs with truthful, explainable rationale; deterministic fallback proven (set `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`).

## Phase 3 — Document generation  ✅
- Prompts P3 (resume changes), P4 (cover letter), P5 (screening answers), interview prep,
  behind the provider abstraction (`generateDocument`). Anthropic uses structured outputs
  validated against `generatedDocSchema`; deterministic heuristic generator is the fallback.
- `generated_documents` storage with metadata (keywords, doNotClaim, flagged gaps, confidence).
- Export endpoint `GET /api/documents/:id/export?format=md|txt` (PDF/DOCX after); fetch + delete.
- "Do not claim" gap flags surfaced per-document in the UI; export links on each doc.
- **Exit:** per-job tailored, truthful documents generated, stored, and exported.

## Phase 4 — Gmail import
- Google OAuth (`gmail.readonly`), encrypted tokens, connect/disconnect.
- BullMQ `gmail-import` worker; per-sender + generic parsers; dedupe; idempotent re-scan.
- Import dashboard with progress and recent imports.
- **Exit:** connect Gmail, scan, and see deduped jobs imported and scored automatically.

## Phase 5 — Production hardening
- Security review against [SECURITY.md](SECURITY.md); helmet/CORS/rate-limit/CSRF finalised.
- Structured logging + redaction; central error handling; audit log.
- Test suite (unit: scoring/parsing/dedupe; API: route inject tests; e2e smoke).
- Dockerfiles for web/api/worker; production compose; deployment + runbook docs; CI.
- **Exit:** green CI, documented deploy, passing security checklist.

## Phase 6 — Browser extension
- "Save to JobPilot" — sends URL, title, user-selected visible text to the API.
- Scores + stores the imported job. **No** auto-apply, auto-fill, or background scraping.
- **Exit:** save a job from any page into JobPilot for scoring/tracking.

## Sequencing rationale
Foundation first so every later feature has a home (jobs, tracker, profile). AI is layered
on top of a working deterministic core so the app is never broken by an AI outage or missing
key. Gmail (highest compliance sensitivity) comes after the manual path proves the pipeline.
Extension is last because the backend it needs already exists by then.
