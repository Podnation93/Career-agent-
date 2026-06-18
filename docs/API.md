# JobPilot — API Route Design

Fastify REST API. JSON in/out. Every request validated with Zod (from `packages/shared`).
Auth via signed session cookie (`jobpilot_session`). All routes are user-scoped; the
`user_id` is taken from the session, never from the client.

Conventions:
- Base path: `/api`
- Errors: `{ error: { code, message, details? } }` with appropriate HTTP status.
- Lists: `?page=&pageSize=&sort=&...filters` → `{ items, total, page, pageSize }`.
- Mutations return the affected resource.

## Auth
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/api/auth/register` | `{email, password, displayName}` | `{user}` + sets cookie |
| POST | `/api/auth/login` | `{email, password}` | `{user}` + sets cookie |
| POST | `/api/auth/logout` | – | `204` clears cookie |
| GET  | `/api/auth/me` | – | `{user}` or `401` |

## Profile
| GET | `/api/profile` | – | `{profile}` |
| PUT | `/api/profile` | `ProfileInput` | `{profile}` |
| GET | `/api/profile/resumes` | – | `{items}` |
| POST | `/api/profile/resumes` | `{label, content, isBase}` | `{resume}` |
| PUT | `/api/profile/resumes/:id` | `{label?, content?, isBase?}` | `{resume}` |
| DELETE | `/api/profile/resumes/:id` | – | `204` |
| GET/POST/PUT/DELETE | `/api/profile/cover-templates[/:id]` | template CRUD | |

## Jobs
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/jobs` | filters: `status, source, location, workType, minScore, salaryMin, company, q, tag, hasMissingSkills`; sort: `score, newest, salary, location` |
| GET | `/api/jobs/:id` | full detail incl. latest score, skills, descriptions, documents, notes, events |
| POST | `/api/jobs` | manual create (also reachable via import) |
| PATCH | `/api/jobs/:id` | edit fields (title, company, status, etc.) |
| PATCH | `/api/jobs/:id/status` | `{status}` → also writes `status_changed` event |
| DELETE | `/api/jobs/:id` | cascade deletes descriptions/scores/docs/events |
| POST | `/api/jobs/:id/tags` | `{tagId}` attach |
| DELETE | `/api/jobs/:id/tags/:tagId` | detach |

## Import
| POST | `/api/import/manual` | `{ kind: 'url'\|'text'\|'file', url?, text?, fileBase64?, filename? }` → parses, dedupes, creates job, enqueues scoring → `{job, duplicateOf?}` |
| GET | `/api/import/status` | `{ queued, running, recentImports[] }` for the import dashboard |

## Gmail
| GET | `/api/gmail/connect` | returns Google OAuth consent URL (state-protected) |
| GET | `/api/gmail/callback` | OAuth redirect target; exchanges code, encrypts + stores tokens, redirects to `/import` |
| GET | `/api/gmail/status` | `{connected, googleEmail, lastScanAt, status}` |
| POST | `/api/gmail/scan` | `{queries?}` enqueues `gmail-import`; returns `{jobId}` (queue job id) |
| DELETE | `/api/gmail/disconnect` | revokes Google token, deletes connection, audit-logs |

## Scoring
| POST | `/api/jobs/:id/score` | force (re)score now (sync or enqueue) → `{score}` |
| GET | `/api/jobs/:id/scores` | scoring history |

## Documents (generation + management)
| POST | `/api/jobs/:id/documents` | `{ kind: document_kind, options? }` → generates via AI/heuristic, stores, returns `{document}` |
| GET | `/api/jobs/:id/documents` | list generated docs for a job |
| GET | `/api/documents/:id` | one document |
| GET | `/api/documents/:id/export?format=md\|txt\|pdf\|docx` | download |
| DELETE | `/api/documents/:id` | remove |

## Tracker
| GET | `/api/tracker` | jobs grouped by status (Kanban) + counts |
| GET | `/api/tracker/board` | columns with ordered cards |
| POST | `/api/tracker/:jobId/event` | `{type, payload?}` append timeline event (e.g. `marked_applied`) |
| GET | `/api/tracker/:jobId/timeline` | ordered events |
| GET/POST/PATCH/DELETE | `/api/reminders[/:id]` | reminder CRUD; `GET /api/reminders?due=true` |
| GET/POST/DELETE | `/api/jobs/:id/notes[/:noteId]` | notes |

## Settings
| GET | `/api/settings` | `{aiProvider, scoringWeights, locationPrefs, gmail}` |
| PUT | `/api/settings/ai` | `{provider, model?}` |
| PUT | `/api/settings/scoring` | `{weights}` |
| PUT | `/api/settings/locations` | location prefs |
| POST | `/api/settings/delete-all-data` | wipes user's jobs/docs/emails/connections (audit-logged, requires password re-entry) |

## Dashboard
| GET | `/api/dashboard/summary` | `{newJobs, goodMatches, applied, interviews, followUpsDue, recentJobs[]}` |

## Health
| GET | `/api/health` | `{status, db, redis}` |

## Security middleware (applied globally)
- `@fastify/cookie` + signed sessions, `@fastify/helmet`, `@fastify/cors` (web origin only),
  `@fastify/rate-limit`, CSRF token for state-changing requests, body size limits,
  Zod validation, central error handler that never leaks stack traces or secrets.
