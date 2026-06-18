# JobPilot — Database Schema

PostgreSQL via Drizzle ORM. Every user-owned table carries `user_id` (multi-user ready).
Timestamps are `timestamptz`; ids are `uuid` (default `gen_random_uuid()`).
Enums are Postgres enums where the value set is stable.

## Enum types

```
work_type        = onsite | hybrid | remote | unknown
job_source       = gmail | manual_url | manual_text | manual_file | extension | feed
job_status       = new | to_review | good_match | maybe | not_suitable | prepared |
                   applied | follow_up | interview | rejected | offer | archived
recommendation   = apply | consider | skip
document_kind    = resume_notes | cover_letter | screening_answers | interview_prep
event_type       = imported | reviewed | scored | resume_generated | cover_letter_generated |
                   opened_apply | marked_applied | marked_not_applied | reminder_set |
                   interview_added | rejected | offer_received | status_changed | note_added
ai_provider      = heuristic | anthropic | openai
gmail_conn_status= active | revoked | error
```

## Tables

### users
| col | type | notes |
|-----|------|-------|
| id | uuid pk | |
| email | text unique not null | |
| password_hash | text | argon2id; null if OAuth-only later |
| display_name | text | |
| created_at / updated_at | timestamptz | |

### sessions
| id (uuid pk) | user_id fk→users | token_hash text | expires_at | created_at |
Server-side session store; cookie holds the opaque token, DB holds its hash.

### profiles  (1:1 with user)
| col | type | notes |
|-----|------|-------|
| id | uuid pk | |
| user_id | fk→users unique | |
| headline | text | e.g. "IT Support Analyst & Cybersecurity Student" |
| summary | text | base professional summary |
| skills | jsonb | `[{name, level, years}]` |
| experience | jsonb | `[{title, company, start, end, bullets[]}]` |
| target_roles | text[] | |
| target_locations | text[] | |
| accept_remote / accept_hybrid / accept_cbd | boolean | |
| salary_goal_min / salary_goal_max | integer | AUD |
| career_goals | text | free text used by AI |
| scoring_weights | jsonb | overrides defaults (skills/experience/location/growth/effort) |
| created_at / updated_at | timestamptz | |

### resumes
Base + tailored resume content. | id | user_id | label | content (text/markdown) | is_base bool | created_at |

### cover_letter_templates
| id | user_id | label | body | tone | created_at |

### job_sources
Lookup/config of import sources & per-sender Gmail rules.
| id | user_id | kind (job_source) | label | config jsonb | enabled bool | created_at |

### jobs  (central entity)
| col | type | notes |
|-----|------|-------|
| id | uuid pk | |
| user_id | fk→users | |
| title | text not null | |
| company | text | |
| location | text | |
| work_type | work_type | |
| salary_min / salary_max | integer | |
| salary_text | text | raw e.g. "$70k–$80k + super" |
| source | job_source | |
| source_url | text | canonicalised |
| apply_url | text | official apply destination |
| date_found | timestamptz | |
| closing_date | timestamptz | |
| match_score | integer | 0–100, denormalised latest |
| recommendation | recommendation | denormalised latest |
| status | job_status | default `new` |
| dedupe_hash | text indexed | normalized title+company+location+url hash |
| created_at / updated_at | timestamptz | |
Indexes: `(user_id, status)`, `(user_id, dedupe_hash)` unique, `(user_id, match_score)`.

### job_descriptions  (snapshot, 1:many history)
| id | job_id fk | raw_import_text text | clean_text text | html text | captured_at |

### job_scores  (history of scoring runs)
| col | type |
|-----|------|
| id | uuid pk |
| job_id | fk→jobs |
| provider | ai_provider |
| score | integer |
| recommendation | recommendation |
| reason | text |
| category_scores | jsonb (role/skills/location/experience/salary/effort) |
| matched_skills | text[] |
| missing_skills | text[] |
| risks | text[] |
| resume_strategy | text |
| cover_letter_angle | text |
| interview_points | text[] |
| confidence | numeric (0–1) |
| warnings | text[] |
| raw_response | jsonb (audited model output) |
| created_at | timestamptz |

### job_skills  (normalized, for filtering)
| id | job_id fk | name text | required bool | matched bool |

### applications  (1:1 with job once user engages)
| id | job_id fk unique | user_id | status job_status | date_applied | follow_up_date |
| interview_date | recruiter_contact text | resume_id fk→resumes | cover_letter_id fk | outcome text |
| notes text | created_at / updated_at |

### application_events  (timeline)
| id | job_id fk | user_id | type event_type | payload jsonb | created_at |

### generated_documents
| id | job_id fk | user_id | kind document_kind | title text | body text(markdown) |
| provider ai_provider | metadata jsonb (flags, missing-skill warnings) | created_at |

### gmail_connections
| col | type | notes |
|-----|------|-------|
| id | uuid pk | |
| user_id | fk→users unique | |
| google_email | text | |
| access_token_enc | bytea | AES-256-GCM ciphertext |
| refresh_token_enc | bytea | AES-256-GCM ciphertext |
| token_iv / token_tag | bytea | per-secret nonce + auth tag |
| scope | text | `gmail.readonly` |
| status | gmail_conn_status | |
| last_scan_at | timestamptz | |
| created_at / updated_at | timestamptz | |
Tokens are **never** logged or returned to the client.

### imported_emails  (idempotency for Gmail)
| id | user_id | gmail_message_id text unique-per-user | from_addr | subject | received_at |
| jobs_extracted int | processed_at |
Prevents re-importing the same message.

### reminders
| id | user_id | job_id fk | remind_at timestamptz | message text | done bool | created_at |

### notes
| id | user_id | job_id fk | body text | created_at |

### tags  +  job_tags
`tags`: | id | user_id | name | color |
`job_tags`: | job_id fk | tag_id fk |  (composite pk)

### audit_log  (security)
| id | user_id | action text | target text | ip text | created_at |
Records sensitive actions (gmail connect/disconnect, delete-all, login).

## Relationships (text ERD)

```
users 1─1 profiles
users 1─* resumes, cover_letter_templates, jobs, tags, reminders, notes
users 1─1 gmail_connections
jobs  1─* job_descriptions, job_scores, job_skills, generated_documents,
          application_events, reminders, notes, job_tags
jobs  1─1 applications
tags  *─* jobs (via job_tags)
```

## Migration strategy
- `drizzle-kit generate` produces SQL migrations checked into `packages/db/migrations/`.
- `pnpm db:migrate` applies them; `pnpm db:push` for fast local iteration.
- `pnpm db:seed` inserts the default user, profile (Dylan's targets/locations), and sample jobs.
