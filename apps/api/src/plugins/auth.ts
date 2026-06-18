import { schema } from "@jobpilot/db";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { hashToken } from "../lib/crypto.js";
import { unauthorized } from "../lib/errors.js";
import type { AuthedUser } from "../types.js";

export const SESSION_COOKIE = "jobpilot_session";

/**
 * Auth plugin: on every request, resolve the session cookie to a user and
 * attach it to `request.user`. Exposes `app.requireUser(req)` for routes.
 */
export default fp(async function authPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const tokenHash = hashToken(token);
    const rows = await app.db
      .select({
        userId: schema.sessions.userId,
        email: schema.users.email,
        displayName: schema.users.displayName,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(and(eq(schema.sessions.tokenHash, tokenHash), gt(schema.sessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (row) {
      req.user = { id: row.userId, email: row.email, displayName: row.displayName };
    }
  });

  app.decorate("requireUser", (req: FastifyRequest): AuthedUser => {
    if (!req.user) throw unauthorized();
    return req.user;
  });
});
