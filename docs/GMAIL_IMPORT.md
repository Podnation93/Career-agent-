# JobPilot — Gmail Import Plan

Imports the **user's own** job-alert emails over **read-only** OAuth. This is the user's
data, accessed with their consent — not scraping a job board.

## Scope & consent
- Single scope: `https://www.googleapis.com/auth/gmail.readonly`.
- OAuth consent screen lists exactly why (read job-alert emails to import listings).
- Tokens encrypted at rest (AES-256-GCM); never logged; revocable via Disconnect.

## OAuth flow
1. `GET /api/gmail/connect` → builds Google consent URL with `state` (signed, CSRF-bound) and `access_type=offline`, `prompt=consent` (to obtain a refresh token).
2. User consents on Google.
3. `GET /api/gmail/callback?code&state` → verify state → exchange code → receive access + refresh tokens → encrypt → upsert `gmail_connections` (status=active) → audit-log `gmail_connected` → redirect to `/import`.
4. Token refresh handled in the worker via the stored (decrypted) refresh token; on `invalid_grant` set status=`error` and prompt re-connect.

## Search queries (configurable per user, sensible defaults)
```text
newer_than:30d (
  from:seek.com.au OR from:indeed.com OR from:linkedin.com OR from:jora.com
  OR subject:("job alert" OR "new jobs" OR "jobs matching" OR "recommended jobs" OR "jobs for you")
)
```
Stored in `job_sources.config`; user can edit in Settings/Import. Sender-based rules
(`from:recruiter@agency.com`) can be added later.

## Worker pipeline (`gmail-import` queue)
1. Decrypt tokens; refresh if expired.
2. `users.messages.list` with the query (paginated, capped per scan, polite — this is a metered Google API, not scraping).
3. For each message id **not** already in `imported_emails`:
   a. `users.messages.get` (format=full) → headers (From, Subject, Date), body (text/html parts), links.
   b. Pick a **per-sender parser** (SEEK / Indeed / LinkedIn / Jora) or the **generic parser**.
   c. Parser → 0..N candidate jobs `{title, company, location, salary?, workType?, applyUrl, sourceUrl, snippet, description?}`.
   d. **Canonicalise URLs** (strip tracking params: `utm_*`, `gclid`, SEEK/Indeed redirect wrappers → resolve to the real listing where the param is plainly present; never follow into login walls).
   e. **Dedupe** (see below). Insert new `jobs` + `job_descriptions`.
   f. Enqueue scoring for each new job.
4. Record `imported_emails` row (idempotency) with `jobs_extracted` count.
5. Update `gmail_connections.last_scan_at`. Emit progress for `/api/import/status`.

## Parsers
Each parser is a pure function `(email) => CandidateJob[]` (unit-testable with fixtures in
`packages/core/parsing/__fixtures__`). Strategy:
- **SEEK / Jora:** alert emails list jobs as cards/links; extract anchor text (title),
  nearby company/location lines, and the listing URL.
- **Indeed:** similar card layout; resolve the listing URL from the tracked link.
- **LinkedIn:** "jobs for you" digest; extract title/company/location per item.
- **Generic fallback:** heuristic — find the strongest job-title-like anchor + surrounding text; lower confidence; flagged for user review.

The raw email is stored only as needed; `imported_emails` keeps minimal metadata.

## Deduplication
A job is a duplicate if **any** of:
1. Canonical `source_url` already exists for the user.
2. Normalised `title + company + location` hash matches.
3. Text-similarity hash (simhash/shingles over clean description) within threshold.
Optional LLM tie-breaker (P7) only for borderline cases. Duplicates increment a "seen
again" timestamp rather than creating a new row; the importer returns `duplicateOf`.

## Idempotency & re-scan
- `imported_emails.gmail_message_id` unique per user → a message is parsed once.
- "Re-scan" re-runs the query; only new message ids are processed.
- "Reset import history" (Settings) clears `imported_emails` to allow a full re-parse.

## Failure handling
- Per-message failures are caught and logged (no PII), the scan continues, and the message
  is **not** marked processed so it retries next scan.
- Whole-scan failure (auth) sets connection status and surfaces a re-connect prompt.
