import { getProvider, type DocGenInput } from "@jobpilot/core";
import { schema } from "@jobpilot/db";
import { generateDocumentSchema, type SkillEntry } from "@jobpilot/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../lib/env.js";
import { notFound } from "../lib/errors.js";
import { toDocDTO } from "../lib/mappers.js";
import { scoreJobForUser } from "../services/scoring.js";

const EVENT_FOR_KIND = {
  resume_notes: "resume_generated",
  cover_letter: "cover_letter_generated",
  screening_answers: "resume_generated",
  interview_prep: "resume_generated",
} as const;

/** Routes mounted under /api/jobs — generate + list documents for a job. */
export default async function documentRoutes(app: FastifyInstance) {
  app.post("/:id/documents", async (req, reply) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const { kind, tone, screeningQuestions } = generateDocumentSchema.parse(req.body);

    const [job] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)));
    if (!job) throw notFound("Job");

    // Ensure we have a score to ground the document; generate one if missing.
    let [score] = await app.db
      .select()
      .from(schema.jobScores)
      .where(eq(schema.jobScores.jobId, id))
      .orderBy(desc(schema.jobScores.createdAt))
      .limit(1);
    if (!score) score = await scoreJobForUser(app.db, user.id, id);

    const [profile] = await app.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, user.id));
    const [descRow] = await app.db
      .select()
      .from(schema.jobDescriptions)
      .where(eq(schema.jobDescriptions.jobId, id))
      .orderBy(desc(schema.jobDescriptions.capturedAt))
      .limit(1);

    const input: DocGenInput = {
      kind,
      tone,
      screeningQuestions,
      profile: {
        headline: profile?.headline ?? null,
        summary: profile?.summary ?? null,
        skills: ((profile?.skills as SkillEntry[]) ?? []).map((s) => s.name),
        experience: ((profile?.experience as DocGenInput["profile"]["experience"]) ?? []) || [],
        careerGoals: profile?.careerGoals ?? null,
      },
      job: {
        title: job.title,
        company: job.company,
        description: descRow?.cleanText ?? descRow?.rawImportText ?? null,
        location: job.location,
      },
      context: {
        matchedSkills: score.matchedSkills,
        missingSkills: score.missingSkills,
        resumeStrategy: score.resumeStrategy,
        coverLetterAngle: score.coverLetterAngle,
        interviewPoints: score.interviewPoints,
      },
    };

    const provider = getProvider(loadEnv());
    const generated = await provider.generateDocument(input);

    const [doc] = await app.db
      .insert(schema.generatedDocuments)
      .values({
        jobId: id,
        userId: user.id,
        kind,
        title: generated.title,
        body: generated.bodyMarkdown,
        provider: provider.name,
        metadata: {
          keywordsToInclude: generated.keywordsToInclude,
          doNotClaim: generated.doNotClaim,
          flaggedGaps: generated.flaggedGaps,
          confidence: generated.confidence,
          warnings: generated.warnings,
        },
      })
      .returning();

    await app.db.insert(schema.applicationEvents).values({
      jobId: id,
      userId: user.id,
      type: EVENT_FOR_KIND[kind],
    });
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

/** Routes mounted under /api/documents — fetch, export, delete a document. */
export async function documentResourceRoutes(app: FastifyInstance) {
  app.get("/:id", async (req) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const [doc] = await app.db
      .select()
      .from(schema.generatedDocuments)
      .where(and(eq(schema.generatedDocuments.id, id), eq(schema.generatedDocuments.userId, user.id)));
    if (!doc) throw notFound("Document");
    return { document: toDocDTO(doc) };
  });

  app.get("/:id/export", async (req, reply) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const format = (req.query as { format?: string }).format ?? "md";
    const [doc] = await app.db
      .select()
      .from(schema.generatedDocuments)
      .where(and(eq(schema.generatedDocuments.id, id), eq(schema.generatedDocuments.userId, user.id)));
    if (!doc) throw notFound("Document");

    const slug = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    // md/txt now; PDF/DOCX land later (kept out of the core path deliberately).
    const ext = format === "txt" ? "txt" : "md";
    const contentType = ext === "txt" ? "text/plain" : "text/markdown";
    reply
      .header("Content-Type", `${contentType}; charset=utf-8`)
      .header("Content-Disposition", `attachment; filename="${slug}.${ext}"`);
    return doc.body;
  });

  app.delete("/:id", async (req, reply) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const res = await app.db
      .delete(schema.generatedDocuments)
      .where(and(eq(schema.generatedDocuments.id, id), eq(schema.generatedDocuments.userId, user.id)))
      .returning({ id: schema.generatedDocuments.id });
    if (res.length === 0) throw notFound("Document");
    return reply.status(204).send();
  });
}
