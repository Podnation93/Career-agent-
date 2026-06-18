# JobPilot — Product Requirements Document

## 1. Summary

JobPilot is a personal, self-hosted **job application copilot** for a single power
user (extensible to multi-user later). It imports job opportunities from safe and
permitted sources, scores them against the user's resume and preferences, generates
truthful tailored application material, and tracks every application through to an
outcome. It **never** submits applications automatically — the human is always the
one who clicks submit on the employer's own site.

## 2. Goals & non-goals

### Goals
- Centralise jobs from Gmail alerts, manual paste/upload, and compliant career feeds.
- Score and rank jobs against a structured profile (skills, location, experience, goals).
- Generate tailored resume notes, cover letters, and screening answers — without inventing experience.
- Provide a polished dashboard + Kanban tracker with statuses, reminders, and a timeline.
- Open the official apply URL and let the user mark the outcome.
- Be private and secure by design (encrypted tokens, least-privilege scopes, deletable data).

### Non-goals (hard constraints)
- ❌ Auto-submitting applications or filling employer forms without explicit user action.
- ❌ Bypassing CAPTCHAs or anti-bot systems; logging into job boards as a bot.
- ❌ Aggressive/mass scraping; ignoring robots.txt or site ToS.
- ❌ Creating fake accounts, impersonating ATS partners, or spamming employers.
- ❌ Collecting more personal data than needed.

## 3. Target user (persona)

**Dylan** — IT Support Analyst & cybersecurity student in Melbourne, AU. Comfortable
with TypeScript/React/Node. Wants a small number of well-matched roles surfaced daily,
truthful tailored documents, and a reliable tracker. Values privacy.

**Target roles:** IT Support Analyst, Service Desk L1/L2, Application/ERP/SQL Support
Analyst, Junior SOC / entry-level Cybersecurity Analyst, Systems/Technical Support,
Helpdesk Analyst, Support Engineer.

**Target locations:** Western Melbourne (Footscray, Sunshine, Werribee, Laverton,
Truganina, Altona, Point Cook…), Melbourne CBD, Richmond/Cremorne/Burnley, Docklands,
Southbank, North Melbourne; plus remote/hybrid around Melbourne.

## 4. User workflow map

```
                 ┌──────────────────────────────────────────────┐
                 │                  IMPORT                        │
                 │  Gmail alerts | paste URL/text | upload PDF    │
                 │  (later: browser extension, career feeds)      │
                 └───────────────────────┬──────────────────────┘
                                         │ extract structured fields
                                         │ dedupe (url / hash / title+co+loc)
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │                 JOB STORE                      │
                 │  jobs + job_descriptions + skills              │
                 └───────────────────────┬──────────────────────┘
                                         │ score vs profile
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │               AI SCORING                       │
                 │  score/100 · Apply|Consider|Skip · reasons     │
                 │  matched/missing skills · resume & CL strategy │
                 └───────────────────────┬──────────────────────┘
                                         ▼
   ┌──────────────┐   review   ┌──────────────────────┐   generate   ┌──────────────┐
   │  DASHBOARD    │──────────▶│   JOB DETAIL PAGE     │────────────▶│  DOCUMENTS    │
   │ filters/sort  │           │ score, skills, notes  │             │ resume notes  │
   └──────────────┘           │  [Apply on orig site] │             │ cover letter  │
                              └───────────┬──────────┘             │ screening ans │
                                          │ opens official URL      └──────────────┘
                                          ▼ (new tab)
                              ┌──────────────────────┐
                              │  USER APPLIES MANUALLY │
                              └───────────┬──────────┘
                                          │ "Did you apply?" prompt
                                          ▼
                 ┌──────────────────────────────────────────────┐
                 │            APPLICATION TRACKER                 │
                 │  status · dates · reminders · timeline events  │
                 │  New→To Review→Good Match→…→Applied→Interview… │
                 └──────────────────────────────────────────────┘
```

## 5. Functional requirements

| # | Requirement |
|---|-------------|
| FR-1 | Import jobs manually via URL, pasted text, or uploaded file (txt/PDF); extract structured fields. |
| FR-2 | Import jobs from Gmail job-alert emails over read-only OAuth; parse + dedupe. |
| FR-3 | Store jobs with full metadata + raw import text + description snapshot. |
| FR-4 | Score each job 0–100 across role/skills/location/experience/salary/effort, with recommendation + rationale. |
| FR-5 | Maintain a structured user profile (resume, skills, target roles/locations, salary & career goals). |
| FR-6 | Generate tailored resume notes, cover letter, screening answers, interview prep — flagging anything not in the profile. |
| FR-7 | Dashboard with filters, sorting, and overview cards. |
| FR-8 | Job detail page with score breakdown, skills, documents, notes, and an Apply button. |
| FR-9 | Apply button opens the original URL in a new tab and prompts to record outcome. |
| FR-10 | Tracker (Kanban + table) with the full status set, reminders, and a per-job timeline. |
| FR-11 | Document export (Markdown now; PDF/DOCX later). |
| FR-12 | Settings: AI provider, Gmail connection, location prefs, scoring weights, privacy/delete-all. |

## 6. Statuses & recommendations

**Statuses:** New, To Review, Good Match, Maybe, Not Suitable, Prepared, Applied,
Follow Up, Interview, Rejected, Offer, Archived.

**Recommendations (from scoring):** Apply, Consider, Skip.

## 7. Non-functional requirements
- **Privacy/security:** encrypted OAuth tokens, least-privilege Gmail scope (`gmail.readonly`), no tokens in logs, deletable data, audit trail. See [SECURITY.md](SECURITY.md).
- **Reliability:** scoring/generation degrade to deterministic heuristic if AI is unavailable.
- **Performance:** dashboard list paginated; imports run in background workers.
- **Portability:** runs locally via Docker Compose; production-ready env config.

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Treated as a scraper / ToS breach | Med | High | No board scraping in core path; Gmail = user's own data; manual paste; only compliant feeds; respect robots.txt; Apply = redirect only. |
| AI hallucinates experience on resume/CL | Med | High | Strict prompts separating facts vs assumptions; "never invent" rule; UI flags missing skills; deterministic fallback; user reviews everything. |
| Gmail OAuth token leak | Low | High | Encrypt at rest (AES-256-GCM), never log, read-only scope, disconnect + delete-all controls. |
| Gmail parsing brittle across senders | High | Med | Per-sender parsers + generic fallback; store raw email; manual re-scan; user can correct fields. |
| Duplicate jobs across sources | High | Low | Multi-signal dedupe: canonical URL, title+company+location, normalized-text hash. |
| Scope creep / never shipping | Med | Med | Strict phase gating (see MILESTONES.md); Phase 1 is a usable MVP on its own. |
| Single-user assumptions block multi-user later | Low | Med | `user_id` FK on every owned row from day one. |
| AI cost runaway | Low | Med | Heuristic default; cache scores; only re-score on change; provider abstraction with token caps. |

## 9. Success metrics
- Time from "job lands in inbox" to "reviewed in dashboard" < 1 day with zero manual data entry.
- ≥ 80% of Gmail alert emails parsed into correct title/company/URL.
- User applies to only high-fit roles (median match score of applied jobs ≥ 70).
- Zero applications ever submitted by the system.
