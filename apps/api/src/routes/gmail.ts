import { schema } from "@jobpilot/db";
import type { GmailStatusDTO } from "@jobpilot/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors.js";

/**
 * Gmail integration surface. Phase 1 exposes status + disconnect; the OAuth
 * flow and read-only scan land in Phase 4 (see docs/GMAIL_IMPORT.md). Connect
 * returns a clear "not configured yet" until Google credentials are wired.
 */
export default async function gmailRoutes(app: FastifyInstance) {
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

  app.get("/connect", async (req) => {
    app.requireUser(req);
    throw new AppError(
      501,
      "not_implemented",
      "Gmail OAuth lands in Phase 4. Set GOOGLE_CLIENT_ID/SECRET and implement the flow per docs/GMAIL_IMPORT.md.",
    );
  });

  app.delete("/disconnect", async (req) => {
    const user = app.requireUser(req);
    await app.db.delete(schema.gmailConnections).where(eq(schema.gmailConnections.userId, user.id));
    await app.db.insert(schema.auditLog).values({ userId: user.id, action: "gmail_disconnect", ip: req.ip });
    return { ok: true };
  });
}
