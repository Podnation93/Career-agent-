# Gmail Import — Setup & Testing Guide

JobPilot imports **your own** job-alert emails over **read-only** OAuth
(`gmail.readonly`). This is your data, accessed with your consent — not scraping a
job board. Tokens are encrypted at rest (AES-256-GCM) and never logged or sent to
the browser.

There are two ways to verify the feature:

- **A — Parsers only (no Google account needed):** unit tests prove the email
  parsing/dedupe logic. Fast, offline.
- **B — Full end-to-end:** create a Google OAuth client and connect a real inbox.

---

## A. Test the parsing logic offline (no Google needed)

```bash
pnpm --filter @jobpilot/core test
```

This runs `packages/core/src/__tests__/email.test.ts`, which feeds SEEK / Indeed /
generic alert-email HTML fixtures through `parseJobAlertEmail` and asserts:
- listing links become candidate jobs; noise links (unsubscribe/settings) are dropped,
- tracking params are stripped and canonical URLs deduped,
- work type is detected, and unknown senders fall back to the generic parser.

To add a real-world case, copy the HTML of one of your own alert emails into a new
fixture and assert the titles/URLs you expect.

---

## B. Full end-to-end OAuth test

### 1. Create a Google Cloud project + OAuth client
1. Go to <https://console.cloud.google.com/> → create (or pick) a project.
2. **APIs & Services → Library →** enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen:**
   - User type **External**; fill app name, support email, developer email.
   - **Scopes:** add `.../auth/gmail.readonly` (you can also leave scopes empty here;
     the app requests `gmail.readonly` at runtime).
   - **Test users:** add the Gmail address you'll connect. While the app is in
     "Testing" you don't need Google verification — only listed test users can connect.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Application type **Web application**.
   - **Authorized redirect URIs →** add **exactly**:
     ```
     http://localhost:3000/api/gmail/callback
     ```
     (the web origin — Next proxies `/api/*` to the API so the session + CSRF
     cookies stay first-party through the Google round-trip).
   - Copy the **Client ID** and **Client secret**.

### 2. Configure JobPilot
In `.env`:
```bash
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback
ENCRYPTION_KEY=<32-byte base64>   # openssl rand -base64 32  (required to store tokens)
WEB_ORIGIN=http://localhost:3000
```
`ENCRYPTION_KEY` must decode to exactly 32 bytes or connecting will error.

### 3. Run and connect
```bash
docker compose up -d        # Postgres (+ Redis)
pnpm db:push && pnpm db:seed
pnpm dev                    # web :3000, api :4000
```
1. Open <http://localhost:3000>, log in (`demo@jobpilot.local` / `jobpilot123`).
2. Go to **Import → Gmail import → Connect Gmail**.
3. Approve the Google consent screen (use the test-user account). You'll be
   redirected back to **/import** with `?gmail=connected` and see
   "Connected as <you>".
4. Click **Scan now**. JobPilot lists matching alert emails (read-only), parses
   them, dedupes, imports new jobs, and scores them. You'll see a summary:
   `Scanned N · M new · imported K · D duplicates`.
5. Open **Jobs** — imported roles appear with `source = gmail` and a match score.
6. **Scan again** — already-processed emails are skipped (idempotent), so a second
   run with no new mail imports 0.

### 4. Verify the security properties
- **Disconnect** (Import or Settings) removes the stored tokens.
- **Settings → Delete all my data** wipes jobs, imports, and the Gmail connection.
- Tokens never appear in logs or any API response (only `googleEmail`, `status`,
  `lastScanAt` are exposed via `GET /api/gmail/status`).

---

## Customising the search
The default Gmail query (last 30 days, SEEK/Indeed/LinkedIn/Jora + common alert
subjects) lives in `apps/api/src/services/gmail.ts` (`DEFAULT_GMAIL_QUERY`). You
can pass a custom `query` in the `POST /api/gmail/scan` body to target specific
senders, e.g. `from:recruiter@agency.com newer_than:14d`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` on Google | The Authorized redirect URI must be **exactly** `http://localhost:3000/api/gmail/callback`. |
| `403 access_denied` | Add your Gmail address as a **test user** on the consent screen. |
| `gmail_not_configured` (501) | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` not set in `.env`. |
| `encryption_key_missing` (500) | Set `ENCRYPTION_KEY` (32-byte base64). |
| `OAuth state mismatch` (403) | Cookies blocked or you reused a stale link — click **Connect Gmail** again. |
| Scan imports 0 with mail present | Your alert senders/subjects differ — pass a custom `query`, or add a fixture + parser branch. |

## Background processing (optional, later)
The scan runs synchronously in the API today (works without Redis). For large
inboxes, move it to the BullMQ `gmail-import` worker (`apps/worker`) — set
`REDIS_URL` and enqueue from `POST /api/gmail/scan`. See [MILESTONES.md](MILESTONES.md).
