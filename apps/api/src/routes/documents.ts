import { getProvider } from "@jobpilot/core";
import { schema } from "@jobpilot/db";
import { generateDocumentSchema, type DocumentKind } from "@jobpilot/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../lib/env.js";
import { notFound } from "../lib/errors.js";
import { toDocDTO } from "../lib/mappers.js";

type ScoreRow = typeof schema.jobScores.$inferSelect;
type JobRow = typeof schema.jobs.$inferSelect;

/**
 * Phase 1 deterministic document generator. Builds truthful drafts from the
 * stored score (which already separates matched vs missing skills). Phase 3
 * replaces the body with AI output behind the same interface.
 */
function buildBody(kind: DocumentKind, job: JobRow, score: ScoreRow | undefined): { title: string; body: string; meta: Record<string, unknown> } {
  const missing = score?.missingSkills ?? [];
  const matched = score?.matchedSkills ?? [];
  const doNotClaim = missing.length
    ? `\n\n> ⚠️ Do not claim: ${missing.join(", ")} (not in your profile). Mention your cybersecurity study and transferable experience instead.`
    : "";
  const company = job.company ?? "the company";

  switch (kind) {
    case "resume_notes":
      return {
        title: `Resume notes — ${job.title}`,
        body:
          `## Tailoring notes for ${job.title} at ${company}\n\n` +
          `**Emphasise:** ${matched.join(", ") || "your closest transferable experience"}.\n\n` +
          `**Suggested summary:** ${score?.resumeStrategy ?? "Lead with your IT support and SQL investigation experience."}` +
          doNotClaim,
        meta: { matched, missing, flagged: missing },
      };
    case "cover_letter":
      return {
        title: `Cover letter — ${job.title}`,
        body:
          `Dear Hiring Manager,\n\n` +
          `I'm writing to apply for the ${job.title} role at ${company}. ` +
          `${score?.coverLetterAngle ?? "My IT support background has prepared me well for this position."} ` +
          `In my current role I handle L1/L2 tickets, investigate data issues with SQL, and support business applications end to end.\n\n` +
          `I would welcome the chance to discuss how my experience fits your team.\n\nKind regards,\nDylan` +
          doNotClaim,
        meta: { angle: score?.coverLetterAngle, flagged: missing },
      };
    case "screening_answers":
      return {
        title: `Screening answers — ${job.title}`,
        body:
          `### Likely screening questions\n\n` +
          `**Why this role?** ${score?.coverLetterAngle ?? "It aligns with my support experience and security goals."}\n\n` +
          `**Relevant skills:** ${matched.join(", ") || "IT support, ticketing, SQL"}.\n\n` +
          (missing.length ? `**Gaps to address honestly:** ${missing.join(", ")}.` : "") +
          doNotClaim,
        meta: { flagged: missing },
      };
    case "interview_prep":
      return {
        title: `Interview prep — ${job.title}`,
        body:
          `### Talking points\n\n` +
          (score?.interviewPoints ?? ["Walk through a real incident you triaged."])
            .map((p) => `- ${p}`)
            .join("\n") +
          doNotClaim,
        meta: { flagged: missing },
      };
  }
}

export default async function documentRoutes(app: FastifyInstance) {
  // Generate (registered under /api/jobs)
  app.post("/:id/documents", async (req, reply) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const { kind } = generateDocumentSchema.parse(req.body);
    const [job] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)));
    if (!job) throw notFound("Job");
    const [score] = await app.db
      .select()
      .from(schema.jobScores)
      .where(eq(schema.jobScores.jobId, id))
      .orderBy(desc(schema.jobScores.createdAt))
      .limit(1);

    const provider = getProvider(loadEnv());
    const { title, body, meta } = buildBody(kind, job, score);
    const [doc] = await app.db
      .insert(schema.generatedDocuments)
      .values({ jobId: id, userId: user.id, kind, title, body, provider: provider.name, metadata: meta })
      .returning();

    const eventType = kind === "cover_letter" ? "cover_letter_generated" : "resume_generated";
    await app.db.insert(schema.applicationEvents).values({ jobId: id, userId: user.id, type: eventType });
    return reply.status(201).send({ document: toDocDTO(doc!) });
  });

  app.get("/:id/documents", async (req) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const rows = await app.db
      .select()
      .from(schema.generatedDocuments)
      .where(and(eq(schema.generatedDocuments.jobId, id), eq(schema.generatedDocuments.userId, user.id)));
    return { items: rows.map(toDocDTO) };
  });
}
