# JobPilot — Step-by-Step Build Plan (for a coding agent)

Concrete, ordered tasks. Each task lists files to create and a done-check. Phase 1 tasks
(T1–T20) are implemented in this build; later phases are specified for continuation.

## Conventions
- Package names: `@jobpilot/shared`, `@jobpilot/db`, `@jobpilot/core`, `@jobpilot/api`, `@jobpilot/web`, `@jobpilot/worker`.
- TS path aliases via `tsconfig.base.json`. ESM throughout (`"type": "module"`).
- Validate inputs with Zod from `@jobpilot/shared`. Never trust client `user_id`.

## Phase 1 — Foundation

**T1 Workspace root.** `package.json` (scripts: dev/build/typecheck/lint/test, `db:*`),
`pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`,
`docker-compose.yml` (postgres:16, redis:7). ✔ `pnpm install` resolves.

**T2 `@jobpilot/shared`.** Enums (status, source, workType, recommendation, etc.), Zod
schemas + inferred types for Job, Profile, ScoreResult, ImportInput, DTOs. ✔ `tsup` builds.

**T3 `@jobpilot/db`.** Drizzle `schema.ts` (all tables in SCHEMA.md), `client.ts` (pg pool),
`drizzle.config.ts`, `seed.ts` (default user + Dylan profile + sample jobs). ✔ `db:push` + `db:seed` run.

**T4 `@jobpilot/core` — location.** Port `legacy/config.yaml` regions/suburbs into
`location/melbourne.ts`; `locationScore(jobLocation, workType, prefs)`. ✔ unit tests pass.

**T5 `@jobpilot/core` — skills.** IT/cyber skill taxonomy + alias matching;
`extractSkills(text)`, `matchSkills(profileSkills, jobSkills)`. ✔ tests.

**T6 `@jobpilot/core` — parsing.** `parseJobText(text|html, url?)` → structured candidate
(title/company/location/salary/workType/applyUrl); URL canonicalisation. ✔ tests on fixtures.

**T7 `@jobpilot/core` — dedupe.** `dedupeHash(job)`, `isDuplicate(a,b)` (url/title+co+loc/simhash). ✔ tests.

**T8 `@jobpilot/core` — scoring (heuristic).** `scoreJob(profile, job, weights)` →
ScoreResult (categories, recommendation, matched/missing, strategy text). Mirrors PROMPTS P2 rubric. ✔ tests.

**T9 `@jobpilot/core` — AI provider stub.** `ChatProvider` interface + `heuristic` impl now;
`anthropic`/`openai` wired in Phase 2. `getProvider(env)`. ✔ builds.

**T10 `@jobpilot/api` — server skeleton.** Fastify + helmet + cors + cookie + rate-limit +
error handler + zod type provider; `GET /api/health`. ✔ server boots, health 200.

**T11 API auth.** `register/login/logout/me`; argon2id; session table; signed cookie; CSRF plugin. ✔ register→login→me works.

**T12 API profile.** `GET/PUT /api/profile`, resumes + cover-template CRUD. ✔ round-trip.

**T13 API jobs.** list (filters/sort/pagination), get, create, patch, status patch (+event), delete, tags. ✔ CRUD + filter tests.

**T14 API import.** `POST /api/import/manual` (url/text/file → parse → dedupe → insert → score), `GET /api/import/status`. ✔ paste text creates scored job; duplicate returns `duplicateOf`.

**T15 API scoring + tracker + documents stubs.** `POST /api/jobs/:id/score`, scores history;
tracker board + events + timeline; reminders + notes; documents list/generate (heuristic body now). ✔ endpoints respond.

**T16 API settings + dashboard.** settings get/put (ai/scoring/locations), delete-all-data, `GET /api/dashboard/summary`. ✔ summary numbers correct.

**T17 `@jobpilot/web` — shell.** Next.js App Router, Tailwind, theme, Sidebar/TopBar, ui primitives, typed `lib/api.ts`. ✔ app renders, nav works.

**T18 Web pages — dashboard/jobs/detail.** Dashboard cards, Jobs list with filters/sort, Job detail with ScorePanel/Skills/Strategy/Documents/Notes/Timeline + **ApplyButton + ApplyDialog**. ✔ end-to-end view of a seeded job; Apply opens original URL.

**T19 Web pages — import/tracker/profile/settings/login.** Manual import form, Kanban tracker with status DnD, profile editor, settings, auth pages. ✔ can import, drag status, edit profile.

**T20 Wire + verify.** `pnpm typecheck` + `pnpm build` green; seed → manual demo path works. ✔

## Phase 2 — AI scoring (continuation)
T21 Anthropic/OpenAI providers (JSON mode, Zod-validated, heuristic fallback). T22 P1
extraction in import. T23 P2 scoring replaces heuristic when provider set; store history.
T24 UI: provider/model + weights in Settings; score breakdown polish.

## Phase 3 — Documents
T25 P3/P4/P5 prompts + endpoints. T26 Documents page + export (md/txt → pdf/docx). T27 "Do not claim" gap UI.

## Phase 4 — Gmail
T28 Google OAuth + encrypted tokens + connect/disconnect + status. T29 `gmail-import` BullMQ
worker + per-sender/generic parsers + fixtures. T30 idempotent re-scan + import dashboard progress.

## Phase 5 — Hardening
T31 logging/redaction/audit. T32 tests (unit/api/e2e). T33 Dockerfiles + prod compose + CI + deploy docs. T34 security review pass.

## Phase 6 — Extension
T35 MV3 extension: save URL+title+selected text → `/api/import/manual` (kind=extension). T36 score + show in dashboard.

---

# Test Plan

## Unit (Vitest, `packages/core`)
- **location:** Footscray→excellent, Newport→good, Geelong onsite→poor, remote→accept.
- **skills:** alias matching ("SQL"/"T-SQL"), matched vs missing computation.
- **parsing:** SEEK/Indeed/LinkedIn fixtures → correct title/company/url; URL canonicalisation strips utm_*.
- **dedupe:** same listing via two URLs → duplicate; different roles same company → not.
- **scoring:** known profile+job → expected band; weights change ordering; missing data lowers confidence; **never invents skills**.

## API (Fastify `inject`)
- auth: register→login→me→logout; bad password 401; CSRF rejected without token.
- jobs: create→list filter by status/score→patch status writes event→delete cascades.
- import: text import creates scored job; duplicate import returns `duplicateOf`, no new row.
- authz: user A cannot read user B's job (404/403).
- settings: delete-all-data wipes only that user's rows.

## Integration / e2e (Playwright smoke, Phase 5)
- register → set profile → paste job → see score → open Apply (new tab to original URL, asserted href) → mark Applied → appears in tracker Applied column.

## Security checks (CI, Phase 5)
- No apply-POST to external domains anywhere (grep guard test).
- Secrets not in bundle; tokens never logged (log redaction test).
- Dependency + secret scanning.

## Manual QA checklist
- Apply button always `target="_blank" rel="noopener noreferrer"` to `apply_url||source_url`.
- Generated docs never assert a skill absent from the profile (spot-check `doNotClaim`).
- Disconnect Gmail removes tokens; delete-all-data leaves no user rows.
