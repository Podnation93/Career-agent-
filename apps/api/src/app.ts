import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createDb } from "@jobpilot/db";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { loadEnv, type Env } from "./lib/env.js";
import { errorHandler } from "./lib/errors.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import documentRoutes, { documentResourceRoutes } from "./routes/documents.js";
import gmailRoutes from "./routes/gmail.js";
import importRoutes from "./routes/import.js";
import jobRoutes from "./routes/jobs.js";
import profileRoutes from "./routes/profile.js";
import scoringRoutes from "./routes/scoring.js";
import settingsRoutes from "./routes/settings.js";
import trackerRoutes from "./routes/tracker.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(envOverride?: Partial<Env>): Promise<FastifyInstance> {
  const env = { ...loadEnv(), ...envOverride };

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      // Never log secrets, cookies, or auth headers.
      redact: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.token"],
    },
  });

  app.setErrorHandler(errorHandler);
  app.decorate("db", createDb(env.DATABASE_URL));

  await app.register(helmet, { contentSecurityPolicy: env.NODE_ENV === "production" });
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  await app.register(authPlugin);

  // Lightweight CSRF defence: reject cross-origin state-changing requests.
  // (Full double-submit token lands in Phase 5 hardening.)
  app.addHook("onRequest", async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return;
    if (req.url.startsWith("/api/auth/")) return; // login/register set the session
    const origin = req.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) {
      reply.status(403).send({ error: { code: "csrf", message: "Cross-origin request blocked" } });
    }
  });

  app.get("/api/health", async () => {
    let db = "ok";
    try {
      await app.db.execute(sql`select 1`);
    } catch {
      db = "error";
    }
    return { status: "ok", db, redis: env.REDIS_URL ? "configured" : "disabled" };
  });

  // Route groups
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(profileRoutes, { prefix: "/api/profile" });
  await app.register(jobRoutes, { prefix: "/api/jobs" });
  await app.register(scoringRoutes, { prefix: "/api/jobs" });
  await app.register(documentRoutes, { prefix: "/api/jobs" });
  await app.register(documentResourceRoutes, { prefix: "/api/documents" });
  await app.register(trackerRoutes, { prefix: "/api/tracker" });
  await app.register(importRoutes, { prefix: "/api/import" });
  await app.register(gmailRoutes, { prefix: "/api/gmail" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });

  return app;
}
