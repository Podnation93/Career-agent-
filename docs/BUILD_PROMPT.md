# Build prompt — for an AI coding tool

> Paste everything between the lines into your AI builder (Cursor, Bolt, v0,
> Lovable, Replit Agent, Claude Code, etc.). It describes the whole product, the
> stack, the data, the screens, and the non-negotiable guardrails. Pair it with
> `docs/DESIGN_PROMPT.md` for the visual direction.

---

Build a web app called **CareerAgent** — a personal, human-in-the-loop job-search
copilot. Its job is to **find** relevant jobs for me and **prepare** my
application materials, so the only thing left for me to do is click through to
the original posting and apply myself. It is read-only and assistive: it never
applies, never submits forms, never logs in as me, and never sends anything on
my behalf.

## Hard guardrails (do not violate)
- **No auto-apply, ever.** The user always opens the original listing and submits
  themselves. The strongest action the app takes is "Open on original site".
- **No scraping of Seek, Indeed, or LinkedIn.** Those break the sites' terms.
  Get jobs only from compliant sources (below).
- **Never fabricate experience.** Tailored resumes/cover letters only rephrase
  and reorder what's genuinely in the user's real resume — no invented skills,
  employers, dates, or achievements.
- **Privacy first.** All personal data (resume, emails, jobs) stays in the user's
  own database. Be explicit about this in the UI.

## Where jobs come from (compliant sources only)
- **Job-alert emails / mailing lists** — read-only Gmail/IMAP access that parses
  the user's subscribed job-alert emails into structured jobs.
- **Manual paste / upload** — paste a job description or a listing URL.
- **Compliant feeds** — RSS/Atom job feeds and official/partner career-page APIs.

These are presented in the UI as sources (incl. "from Seek/Indeed alert email"),
but the data always arrives via the email parse or a feed — never by scraping.

## Tech stack (match exactly)
- **Monorepo:** pnpm workspaces.
- **Web:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn-style UI components.
- **API:** Fastify + TypeScript + Zod for validation.
- **Worker:** BullMQ on Redis for background jobs (email import, scoring).
- **DB:** PostgreSQL with Drizzle ORM.
- **Shared packages:** `packages/shared` (Zod schemas + types), `packages/core` (scoring, parsing, AI).
- **AI:** a provider abstraction (Anthropic Claude / OpenAI / deterministic
  heuristic fallback) so the app fully works with no API key.
- **Infra:** Docker Compose for Postgres + Redis.

```
apps/
  web/     Next.js front-end
  api/     Fastify REST API
  worker/  BullMQ workers (email import, scoring)
packages/
  shared/  Zod schemas + shared types
  core/    scoring, resume/cover-letter parsing, AI tailoring
```

## Data model (Drizzle / Postgres)
- **profile** — name, contact, parsed resume (work history, skills, certs,
  education), and a stored cover-letter sample that captures the user's voice.
- **job** — source, externalId, title, company, location, description, url,
  salary, remote/hybrid flags, postedAt; plus computed: locationMatch
  (Excellent/Good/Poor), fit scores (skills/experience/location/growth/overall),
  fitReason, requirementsMet[], gaps[], recommendation.
- **document** — per-job tailored resume + cover letter (short & full), ATS
  score + suggestions, version history, status (draft/edited).
- **application** — shortlist/tracker row: jobId, status
  (Saved → Preparing → Applied → Interview → Rejected → Offer), the document
  version used, dateApplied (set by the user), notes, gotResponse.
- **source_connection** — connected email accounts / mailing lists / feeds,
  with read-only scope and last-sync time.

## Core flows
1. **Onboarding** — upload resume (PDF/DOCX/TXT) → parse into structured profile
   the user confirms/edits; capture a cover-letter sample for voice; set
   preferred locations (default: Western Melbourne, Melbourne CBD, Richmond +
   nearby suburbs; accept remote/hybrid) and target roles; connect sources.
2. **Ingest (worker)** — periodically read job-alert emails and feeds, parse into
   `job` rows, dedupe by a stable hash, and filter by location preference.
3. **Score** — for each job compute a transparent 0–100 fit with a four-part
   breakdown, "why it fits", requirements met, gaps, and a recommendation. Use
   the AI provider when configured; otherwise a deterministic keyword/location
   heuristic. With AI, do semantic skill matching (synonyms) but keep the numeric
   score explainable.
4. **Tailor** — on demand for a job, generate a tailored resume and a cover
   letter (short + full) in the user's voice, truthful to the real resume, with
   an ATS check (keyword coverage, sections, length) and concrete suggestions.
   Let the user edit and download (PDF/Markdown/plain text).
5. **Apply (manual)** — a prominent "Open on original site" button. The user
   applies themselves, then marks the job Applied in the tracker.
6. **Track & learn** — a shortlist/tracker and light analytics (response rate,
   which skills/keywords correlate with responses).

## Screens / routes (Next.js App Router)
- `/onboarding` — resume + cover-letter upload, locations, roles, source connect.
- `/` (Home/Today) — ranked short list of best new matches with fit score, fit
  badge, salary, one-line why, and open/save/dismiss.
- `/jobs` — all jobs with filters (location + remote/hybrid, role, salary,
  match-score slider, recency, source).
- `/jobs/[id]` — hero job detail: full posting + fit ring & breakdown +
  requirements/gaps + tailored resume & cover-letter preview (editable, "nothing
  invented") + **Open on original site**.
- `/jobs/[id]/tailor` — focused document tailoring/editing with ATS panel & versions.
- `/tracker` — saved & applied board (Saved → … → Offer), manual status, light stats.
- `/settings` — profile, resume, cover letter, locations (suburb chips), target
  roles, source connections (email/feeds, read-only), AI provider, privacy note.

## API surface (Fastify, Zod-validated)
Resourceful REST: `profile`, `jobs` (list/get/filter), `jobs/:id/score`,
`jobs/:id/documents` (generate/get/update), `applications` (tracker CRUD +
status), `sources` (connect/sync/list), `analytics`. Background work (email
import, scoring) runs in the worker via BullMQ queues.

## Visual & UX direction
Calm, premium, trustworthy — flagship-level polish (Linear / Arc / Superhuman),
never spammy. The **fit score** is the hero: an animated radial ring with the
four sub-scores easing in. Soft real shadows, a faint tasteful gradient glow in
headers/empty states, smooth physics-based motion (cards lift, numbers count up),
reduced-motion respected, strong type hierarchy, crisp icons, thoughtful
empty/loading states. Light theme + a premium near-black dark theme with a deep
blue accent. Use realistic Melbourne job content, never lorem ipsum. See
`docs/DESIGN_PROMPT.md` for the full design brief.

## Build order (ship vertically)
1. Monorepo + Docker Compose (Postgres/Redis) + Drizzle schema + shared Zod types.
2. Profile onboarding (resume parse) + settings.
3. Manual job paste/upload → store → score (heuristic) → job detail with fit.
4. Email/feed ingest worker (read-only) feeding the jobs list.
5. Document tailoring + ATS + editing/download.
6. Tracker + analytics.
7. AI provider wired into scoring + tailoring, with the heuristic fallback intact.
8. The full visual polish pass from the design brief.

## Non-goals
No auto-apply, no form-filling, no captcha-solving, no scraping restricted
boards, no impersonation. If a feature would submit anything on the user's
behalf, don't build it — surface "Open on original site" instead.

Deliver clean, typed, tested code with seed data so the whole flow runs locally
with `docker compose up` and `pnpm dev`, and works end-to-end with no AI key
(deterministic fallback) as well as with one.

---
