import { schema } from "@jobpilot/db";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { notFound } from "../lib/errors.js";
import { toScoreDTO } from "../lib/mappers.js";
import { scoreJobForUser } from "../services/scoring.js";

/** Registered under /api/jobs — adds scoring endpoints to the jobs resource. */
export default async function scoringRoutes(app: FastifyInstance) {
  app.post("/:id/score", async (req) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const [job] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)));
    if (!job) throw notFound("Job");
    const score = await scoreJobForUser(app.db, user.id, id);
    return { score: toScoreDTO(score) };
  });

  app.get("/:id/scores", async (req) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const [job] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)));
    if (!job) throw notFound("Job");
    const rows = await app.db
      .select()
      .from(schema.jobScores)
      .where(eq(schema.jobScores.jobId, id))
      .orderBy(desc(schema.jobScores.createdAt));
    return { items: rows.map(toScoreDTO) };
  });
}
