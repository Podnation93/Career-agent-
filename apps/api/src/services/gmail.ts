/**
 * Gmail integration — read-only OAuth + REST, plus the scan pipeline. We access
 * the user's OWN job-alert emails with their consent (scope: gmail.readonly).
 * Tokens are encrypted at rest (AES-256-GCM) and never logged or returned to the
 * client. No board scraping; the scan runs synchronously (graceful without Redis).
 */
import { canonicalizeUrl, dedupeHash, parseJobAlertEmail, type ParsedEmail } from "@jobpilot/core";
import { schema, type Database } from "@jobpilot/db";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { loadEnv } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { scoreJobForUser } from "./scoring.js";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const DEFAULT_GMAIL_QUERY =
  'newer_than:30d (from:seek.com.au OR from:indeed.com OR from:linkedin.com OR from:jora.com ' +
  'OR subject:("job alert" OR "new jobs" OR "jobs matching" OR "recommended jobs" OR "jobs for you"))';

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expiry: number; // epoch ms
}

function requireOAuthConfig() {
  const env = loadEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new AppError(
      501,
      "gmail_not_configured",
      "Gmail is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
    );
  }
  if (!env.ENCRYPTION_KEY) {
    throw new AppError(500, "encryption_key_missing", "ENCRYPTION_KEY must be set to store Gmail tokens.");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    encryptionKey: env.ENCRYPTION_KEY,
  };
}

/** Build the Google consent URL. `state` is a CSRF token bound to the request. */
export function buildConsentUrl(state: string): string {
  const { clientId, redirectUri } = requireOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    throw new AppError(502, "gmail_token_error", `Google token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expiry: Date.now() + (json.expires_in - 60) * 1000,
  };
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const { clientId, clientSecret, redirectUri } = requireOAuthConfig();
  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireOAuthConfig();
  const set = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  set.refresh_token = set.refresh_token ?? refreshToken;
  return set;
}

/** Encrypt the full token set into a single GCM blob (fits the schema's iv/tag pair). */
function encryptTokens(tokens: TokenSet): { enc: Buffer; iv: Buffer; tag: Buffer } {
  const { encryptionKey } = requireOAuthConfig();
  const blob = encryptSecret(JSON.stringify(tokens), encryptionKey);
  return { enc: blob.ciphertext, iv: blob.iv, tag: blob.tag };
}

function decryptTokens(row: typeof schema.gmailConnections.$inferSelect): TokenSet {
  const { encryptionKey } = requireOAuthConfig();
  if (!row.accessTokenEnc || !row.tokenIv || !row.tokenTag) {
    throw new AppError(400, "gmail_tokens_missing", "Stored Gmail tokens are incomplete; reconnect Gmail.");
  }
  const json = decryptSecret(
    { ciphertext: row.accessTokenEnc, iv: row.tokenIv, tag: row.tokenTag },
    encryptionKey,
  );
  return JSON.parse(json) as TokenSet;
}

/** Fetch the connected Google account's email (for display). */
async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { emailAddress?: string };
  return json.emailAddress ?? null;
}

/** Persist a freshly obtained token set (used by connect + refresh). */
export async function storeConnection(db: Database, userId: string, tokens: TokenSet): Promise<string | null> {
  const googleEmail = await fetchGoogleEmail(tokens.access_token);
  const { enc, iv, tag } = encryptTokens(tokens);
  const values = {
    userId,
    googleEmail,
    accessTokenEnc: enc,
    refreshTokenEnc: null,
    tokenIv: iv,
    tokenTag: tag,
    scope: SCOPE,
    status: "active" as const,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.gmailConnections)
    .values(values)
    .onConflictDoUpdate({ target: schema.gmailConnections.userId, set: values });
  return googleEmail;
}

/** Return a valid access token, refreshing + persisting if expired. */
async function getAccessToken(db: Database, row: typeof schema.gmailConnections.$inferSelect): Promise<string> {
  let tokens = decryptTokens(row);
  if (Date.now() >= tokens.expiry && tokens.refresh_token) {
    try {
      tokens = await refreshTokens(tokens.refresh_token);
      const { enc, iv, tag } = encryptTokens(tokens);
      await db
        .update(schema.gmailConnections)
        .set({ accessTokenEnc: enc, tokenIv: iv, tokenTag: tag, status: "active", updatedAt: new Date() })
        .where(eq(schema.gmailConnections.id, row.id));
    } catch {
      await db
        .update(schema.gmailConnections)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(schema.gmailConnections.id, row.id));
      throw new AppError(401, "gmail_reauth_required", "Gmail authorization expired. Reconnect Gmail.");
    }
  }
  return tokens.access_token;
}

async function listMessageIds(accessToken: string, query: string, max: number): Promise<string[]> {
  const url = `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${max}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new AppError(502, "gmail_list_error", `Gmail list failed (${res.status})`);
  const json = (await res.json()) as { messages?: { id: string }[] };
  return (json.messages ?? []).map((m) => m.id);
}

function b64urlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function collectBody(part: GmailPart, acc: { html: string; text: string }): void {
  if (part.body?.data) {
    const decoded = b64urlDecode(part.body.data);
    if (part.mimeType === "text/html") acc.html += decoded;
    else if (part.mimeType === "text/plain") acc.text += decoded;
  }
  for (const p of part.parts ?? []) collectBody(p, acc);
}

async function getMessage(accessToken: string, id: string): Promise<ParsedEmail> {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new AppError(502, "gmail_get_error", `Gmail get failed (${res.status})`);
  const json = (await res.json()) as {
    payload?: GmailPart & { headers?: { name: string; value: string }[] };
  };
  const headers = json.payload?.headers ?? [];
  const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const acc = { html: "", text: "" };
  if (json.payload) collectBody(json.payload, acc);
  return {
    from: header("from"),
    subject: header("subject"),
    date: header("date"),
    html: acc.html,
    text: acc.text,
  };
}

export interface ScanResult {
  scanned: number;
  newMessages: number;
  imported: number;
  duplicates: number;
}

/** Run a full read-only scan: list → parse → dedupe → insert → score. Idempotent. */
export async function runGmailScan(db: Database, userId: string, query?: string, max = 25): Promise<ScanResult> {
  const [conn] = await db
    .select()
    .from(schema.gmailConnections)
    .where(eq(schema.gmailConnections.userId, userId));
  if (!conn) throw new AppError(400, "gmail_not_connected", "Connect Gmail first.");

  const accessToken = await getAccessToken(db, conn);
  const ids = await listMessageIds(accessToken, query ?? DEFAULT_GMAIL_QUERY, max);

  const result: ScanResult = { scanned: ids.length, newMessages: 0, imported: 0, duplicates: 0 };

  for (const messageId of ids) {
    // Idempotency: skip messages we've already processed.
    const seen = await db
      .select({ id: schema.importedEmails.id })
      .from(schema.importedEmails)
      .where(and(eq(schema.importedEmails.userId, userId), eq(schema.importedEmails.gmailMessageId, messageId)));
    if (seen.length) continue;
    result.newMessages++;

    try {
      const email = await getMessage(accessToken, messageId);
      const candidates = parseJobAlertEmail(email);
      let extracted = 0;

      for (const cand of candidates) {
        const hashKey = dedupeHash({
          title: cand.title,
          company: cand.company,
          location: cand.location,
          url: cand.sourceUrl,
        });
        const [dup] = await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.dedupeHash, hashKey)));
        if (dup) {
          result.duplicates++;
          continue;
        }
        const [job] = await db
          .insert(schema.jobs)
          .values({
            userId,
            title: cand.title,
            company: cand.company,
            location: cand.location,
            workType: cand.workType,
            salaryText: cand.salaryText,
            source: "gmail",
            sourceUrl: cand.sourceUrl ? canonicalizeUrl(cand.sourceUrl) : null,
            applyUrl: cand.applyUrl ?? cand.sourceUrl,
            dedupeHash: hashKey,
          })
          .returning();
        if (cand.snippet) {
          await db.insert(schema.jobDescriptions).values({ jobId: job!.id, rawImportText: cand.snippet, cleanText: cand.snippet });
        }
        await db.insert(schema.applicationEvents).values({
          jobId: job!.id,
          userId,
          type: "imported",
          payload: { source: "gmail", confidence: cand.confidence },
        });
        await scoreJobForUser(db, userId, job!.id);
        result.imported++;
        extracted++;
      }

      // Mark processed only after successful parse (so failures retry next scan).
      await db
        .insert(schema.importedEmails)
        .values({
          userId,
          gmailMessageId: messageId,
          fromAddr: email.from.slice(0, 320),
          subject: email.subject.slice(0, 500),
          jobsExtracted: extracted,
        })
        .onConflictDoNothing();
    } catch {
      // Per-message failure: skip recording so it retries; continue the scan.
      continue;
    }
  }

  await db
    .update(schema.gmailConnections)
    .set({ lastScanAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.gmailConnections.id, conn.id));

  return result;
}
