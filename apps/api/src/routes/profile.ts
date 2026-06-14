import { schema } from "@jobpilot/db";
import { profileSchema } from "@jobpilot/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { toProfileDTO } from "../lib/mappers.js";

export default async function profileRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user = app.requireUser(req);
    let [row] = await app.db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id));
    if (!row) {
      [row] = await app.db.insert(schema.profiles).values({ userId: user.id }).returning();
    }
    return { profile: toProfileDTO(row!) };
  });

  app.put("/", async (req) => {
    const user = app.requireUser(req);
    const input = profileSchema.parse(req.body);
    const values = {
      headline: input.headline ?? null,
      summary: input.summary ?? null,
      skills: input.skills,
      experience: input.experience,
      targetRoles: input.targetRoles,
      targetLocations: input.targetLocations,
      acceptRemote: input.acceptRemote,
      acceptHybrid: input.acceptHybrid,
      acceptCbd: input.acceptCbd,
      salaryGoalMin: input.salaryGoalMin ?? null,
      salaryGoalMax: input.salaryGoalMax ?? null,
      careerGoals: input.careerGoals ?? null,
      scoringWeights: input.scoringWeights ?? null,
      updatedAt: new Date(),
    };
    const [row] = await app.db
      .insert(schema.profiles)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: schema.profiles.userId, set: values })
      .returning();
    return { profile: toProfileDTO(row!) };
  });

  // Resumes
  app.get("/resumes", async (req) => {
    const user = app.requireUser(req);
    const items = await app.db.select().from(schema.resumes).where(eq(schema.resumes.userId, user.id));
    return { items };
  });

  app.post("/resumes", async (req, reply) => {
    const user = app.requireUser(req);
    const body = req.body as { label?: string; content?: string; isBase?: boolean };
    const [row] = await app.db
      .insert(schema.resumes)
      .values({
        userId: user.id,
        label: body.label ?? "Resume",
        content: body.content ?? "",
        isBase: body.isBase ?? false,
      })
      .returning();
    return reply.status(201).send({ resume: row });
  });
}
