import { verify } from "@node-rs/argon2";
import { schema } from "@jobpilot/db";
import { aiSettingsSchema, deleteAllSchema, scoringWeightsSchema } from "@jobpilot/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../lib/env.js";
import { AppError } from "../lib/errors.js";

export default async function settingsRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user = app.requireUser(req);
    const env = loadEnv();
    const [profile] = await app.db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id));
    const [gmail] = await app.db
      .select()
      .from(schema.gmailConnections)
      .where(eq(schema.gmailConnections.userId, user.id));
    return {
      aiProvider: env.AI_PROVIDER,
      scoringWeights: profile?.scoringWeights ?? null,
      locationPrefs: profile
        ? {
            acceptRemote: profile.acceptRemote,
            acceptHybrid: profile.acceptHybrid,
            acceptCbd: profile.acceptCbd,
            targetLocations: profile.targetLocations,
          }
        : null,
      gmail: gmail ? { connected: true, googleEmail: gmail.googleEmail, status: gmail.status } : { connected: false },
    };
  });

  // AI provider is process-level config in Phase 1; expose for the UI to read.
  app.put("/ai", async (req) => {
    app.requireUser(req);
    const body = aiSettingsSchema.parse(req.body);
    // Persisting per-user provider override lands in Phase 2; acknowledge for now.
    return { ok: true, provider: body.provider, note: "AI provider is set via AI_PROVIDER env in Phase 1." };
  });

  app.put("/scoring", async (req) => {
    const user = app.requireUser(req);
    const weights = scoringWeightsSchema.parse(req.body);
    await app.db
      .update(schema.profiles)
      .set({ scoringWeights: weights, updatedAt: new Date() })
      .where(eq(schema.profiles.userId, user.id));
    return { ok: true, weights };
  });

  app.post("/delete-all-data", async (req, reply) => {
    const user = app.requireUser(req);
    const { password } = deleteAllSchema.parse(req.body);
    const [u] = await app.db.select().from(schema.users).where(eq(schema.users.id, user.id));
    const ok = u?.passwordHash ? await verify(u.passwordHash, password) : false;
    if (!ok) throw new AppError(403, "invalid_password", "Password confirmation failed");

    // Cascades remove jobs/descriptions/scores/docs/events/notes/reminders/gmail.
    await app.db.delete(schema.jobs).where(eq(schema.jobs.userId, user.id));
    await app.db.delete(schema.gmailConnections).where(eq(schema.gmailConnections.userId, user.id));
    await app.db.delete(schema.importedEmails).where(eq(schema.importedEmails.userId, user.id));
    await app.db.delete(schema.reminders).where(eq(schema.reminders.userId, user.id));
    await app.db.insert(schema.auditLog).values({ userId: user.id, action: "delete_all_data", ip: req.ip });
    return reply.status(200).send({ ok: true });
  });
}
