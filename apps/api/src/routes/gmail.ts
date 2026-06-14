import { randomBytes } from "node:crypto";
import { schema } from "@jobpilot/db";
import type { GmailStatusDTO } from "@jobpilot/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../lib/env.js";
import { AppError, unauthorized } from "../lib/errors.js";
import {
  buildConsentUrl,
  DEFAULT_GMAIL_QUERY,
  exchangeCode,
  runGmailScan,
  storeConnection,
} from "../services/gmail.js";

const STATE_COOKIE = "jp_gmail_state";

/**
 * Gmail integration. OAuth uses gmail.readonly only. The redirect URI should be
 * the web origin (proxied to the API) so the session + CSRF-state cookies are
 * first-party and survive the Google round-trip. See docs/GMAIL_SETUP.md.
 */
export default async function gmailRoutes(app: FastifyInstance) {
  const env = loadEnv();
  const secure = env.NODE_ENV === "production";

  app.get("/status", async (req): Promise<GmailStatusDTO> => {
    const user = app.requireUser(req);
    const [conn] = await app.db
      .select()
      .from(schema.gmailConnections)
      .where(eq(schema.gmailConnections.userId, user.id));
    if (!conn) return { connected: false, googleEmail: null, lastScanAt: null, status: null };
    return {
      connected: conn.status === "active",
      googleEmail: conn.googleEmail,
      lastScanAt: conn.lastScanAt ? conn.lastScanAt.toISOString() : null,
      status: conn.status,
    };
  });

  // Returns the Google consent URL and sets a signed CSRF-state cookie.
  app.get("/connect", async (req, reply) => {
    app.requireUser(req);
    const state = randomBytes(24).toString("hex");
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      signed: true,
      path: "/",
      maxAge: 600,
    });
    return { url: buildConsentUrl(state) };
  });

  // OAuth redirect target. Verifies state, exchanges the code, stores tokens.
  app.get("/callback", async (req, reply) => {
    const user = req.user;
    if (!user) throw unauthorized();
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (error) return reply.redirect(`${env.WEB_ORIGIN}/import?gmail=denied`);

    const cookie = req.cookies[STATE_COOKIE];
    const unsigned = cookie ? app.unsignCookie(cookie) : { valid: false, value: null };
    if (!code || !state || !unsigned.valid || unsigned.value !== state) {
      throw new AppError(403, "gmail_state_mismatch", "OAuth state mismatch — please retry the connection.");
    }
    reply.clearCookie(STATE_COOKIE, { path: "/" });

    const tokens = await exchangeCode(code);
    const googleEmail = await storeConnection(app.db, user.id, tokens);
    await app.db.insert(schema.auditLog).values({ userId: user.id, action: "gmail_connected", target: googleEmail, ip: req.ip });
    return reply.redirect(`${env.WEB_ORIGIN}/import?gmail=connected`);
  });

  // Run a read-only scan synchronously (Phase 4 baseline; Redis/BullMQ optional later).
  app.post("/scan", async (req) => {
    const user = app.requireUser(req);
    const body = (req.body ?? {}) as { query?: string; max?: number };
    const result = await runGmailScan(app.db, user.id, body.query, body.max ?? 25);
    await app.db.insert(schema.auditLog).values({ userId: user.id, action: "gmail_scan", ip: req.ip });
    return { ...result, query: body.query ?? DEFAULT_GMAIL_QUERY };
  });

  app.delete("/disconnect", async (req) => {
    const user = app.requireUser(req);
    await app.db.delete(schema.gmailConnections).where(eq(schema.gmailConnections.userId, user.id));
    await app.db.insert(schema.auditLog).values({ userId: user.id, action: "gmail_disconnect", ip: req.ip });
    return { ok: true };
  });
}
