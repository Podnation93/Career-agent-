# JobPilot — Security, Privacy & Compliance Plan

JobPilot handles resumes, email content, and job history — sensitive personal data.
Security is a first-class requirement, and compliance with job-board terms is non-negotiable.

## 1. Compliance posture (the core promise)

JobPilot is a **human-in-the-loop copilot**. It **must not**:
- auto-submit applications or fill employer forms without explicit user action;
- use unofficial APIs to submit applications;
- bypass CAPTCHAs or evade bot detection;
- create fake accounts or impersonate a human/ATS partner;
- scrape job boards aggressively or ignore robots.txt / site ToS;
- spam employers; collect more personal data than needed;
- send anything without the user's final approval.

It **may**:
- read the user's **own** Gmail job alerts (read-only, with consent);
- parse those emails and store job links/metadata;
- score jobs and generate draft material;
- open the official apply URL in a new tab; track progress; remind the user.

**Apply = redirect only.** The Apply button is a plain `<a target="_blank"
rel="noopener noreferrer">` to the employer's own URL. No automation, ever.

Compliance is enforced architecturally: there is **no code path** that POSTs to an
employer/job-board apply endpoint. The browser extension (future) is "save current page +
selected text" only — no auto-fill, no background scraping, no apply.

## 2. Authentication & sessions
- Passwords hashed with **argon2id**.
- Opaque session token in an **HttpOnly, Secure, SameSite=Lax** signed cookie; only the
  token **hash** is stored server-side (`sessions`); expiry enforced; logout revokes.
- **CSRF** protection (double-submit token) on all state-changing requests.

## 3. OAuth token protection
- Gmail tokens encrypted at rest with **AES-256-GCM** (`ENCRYPTION_KEY`, 32 bytes), unique
  IV per secret, auth tag stored alongside.
- Tokens **never** logged, **never** sent to the client, **never** in error messages.
- Least-privilege scope `gmail.readonly`. Disconnect revokes at Google and deletes locally.

## 4. Input/output safety
- Every request body/query validated with **Zod**; reject unknown fields.
- Uploaded files: type/size limits, parsed in a sandboxed code path, never executed.
- Output encoding in React (no `dangerouslySetInnerHTML` on imported job HTML without sanitisation via DOMPurify).
- Body size limits; JSON depth limits.

## 5. Transport & headers
- HTTPS in production; HSTS.
- `@fastify/helmet` (CSP, X-Content-Type-Options, frame-ancestors none, etc.).
- CORS restricted to the web origin; credentials allowed only for that origin.

## 6. Rate limiting & abuse
- `@fastify/rate-limit` globally + stricter limits on auth and import endpoints.
- Gmail scans throttled and capped per scan (polite API usage).

## 7. Logging & audit
- Structured logs (pino) with **redaction** of tokens, passwords, cookies, and email bodies.
- `audit_log` records: login, gmail connect/disconnect, scan, delete-all-data, settings changes (action, target, ip, time).
- No PII or secrets in client-side logs.

## 8. Data minimisation & user control
- Store only fields needed to score/track jobs. Email bodies kept only as long as needed to parse; `imported_emails` holds minimal metadata.
- **Disconnect Gmail** and **Delete all my data** (password-confirmed, audit-logged) controls in Settings.
- Per-job and per-document delete.

## 9. Secrets & config
- All secrets via environment variables; `.env` git-ignored; only `.env.example` committed.
- `ENCRYPTION_KEY` / `SESSION_SECRET` validated at boot (length checks) — app refuses to start with weak/missing keys in production.
- No secrets in code, logs, or the client bundle.

## 10. Database & deployment
- Parameterised queries via Drizzle (no string SQL with user input).
- Migrations reviewed and version-controlled.
- Principle of least privilege for the DB role.
- Dependency scanning (CI), secret scanning, and a documented `SECURITY.md` reporting path.

## 11. Threat model summary
| Threat | Control |
|--------|---------|
| Stolen session cookie | HttpOnly+Secure+SameSite, short expiry, server-side revocation |
| Token theft from DB | AES-256-GCM encryption, key in env/secret manager |
| CSRF | SameSite + double-submit token |
| XSS via imported job HTML | Sanitise/escape; CSP |
| SQL injection | Drizzle parameterisation + Zod |
| Brute-force login | Rate limit + argon2id |
| Accidental ToS breach | No apply-POST code path; redirect-only; read-only Gmail |
| Data over-collection | Minimisation + delete-all controls |
