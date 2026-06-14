import { dedupeHash } from "@jobpilot/core";
import { schema } from "@jobpilot/db";
import {
  jobInputSchema,
  jobListQuerySchema,
  jobPatchSchema,
  jobStatusPatchSchema,
  type JobDetailDTO,
} from "@jobpilot/shared";
import { and, asc, desc, eq, gte, ilike, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { notFound } from "../lib/errors.js";
import {
  toDocDTO,
  toEventDTO,
  toJobDTO,
  toNoteDTO,
  toScoreDTO,
  toSkillDTO,
} from "../lib/mappers.js";

export default async function jobRoutes(app: FastifyInstance) {
  // List with filters / sort / pagination
  app.get("/", async (req) => {
    const user = app.requireUser(req);
    const q = jobListQuerySchema.parse(req.query);

    const conds: SQL[] = [eq(schema.jobs.userId, user.id)];
    if (q.status) conds.push(eq(schema.jobs.status, q.status));
    if (q.source) conds.push(eq(schema.jobs.source, q.source));
    if (q.workType) conds.push(eq(schema.jobs.workType, q.workType));
    if (q.company) conds.push(ilike(schema.jobs.company, `%${q.company}%`));
    if (q.location) conds.push(ilike(schema.jobs.location, `%${q.location}%`));
    if (q.q) conds.push(ilike(schema.jobs.title, `%${q.q}%`));
    if (q.minScore != null) conds.push(gte(schema.jobs.matchScore, q.minScore));
    if (q.salaryMin != null) conds.push(gte(schema.jobs.salaryMax, q.salaryMin));
    const where = and(...conds);

    const orderBy =
      q.sort === "newest"
        ? desc(schema.jobs.dateFound)
        : q.sort === "salary"
          ? desc(schema.jobs.salaryMax)
          : q.sort === "location"
            ? asc(schema.jobs.location)
            : desc(schema.jobs.matchScore);

    const countRows = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(where);
    const count = countRows[0]?.count ?? 0;

    const rows = await app.db
      .select()
      .from(schema.jobs)
      .where(where)
      .orderBy(orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    return { items: rows.map(toJobDTO), total: count ?? 0, page: q.page, pageSize: q.pageSize };
  });

  // Detail
  app.get("/:id", async (req): Promise<{ job: JobDetailDTO }> => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const [job] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)));
    if (!job) throw notFound("Job");

    const [descRow] = await app.db
      .select()
      .from(schema.jobDescriptions)
      .where(eq(schema.jobDescriptions.jobId, id))
      .orderBy(desc(schema.jobDescriptions.capturedAt))
      .limit(1);
    const scores = await app.db
      .select()
      .from(schema.jobScores)
      .where(eq(schema.jobScores.jobId, id))
      .orderBy(desc(schema.jobScores.createdAt))
      .limit(1);
    const skills = await app.db.select().from(schema.jobSkills).where(eq(schema.jobSkills.jobId, id));
    const docs = await app.db
      .select()
      .from(schema.generatedDocuments)
      .where(eq(schema.generatedDocuments.jobId, id));
    const notesRows = await app.db.select().from(schema.notes).where(eq(schema.notes.jobId, id));
    const events = await app.db
      .select()
      .from(schema.applicationEvents)
      .where(eq(schema.applicationEvents.jobId, id))
      .orderBy(desc(schema.applicationEvents.createdAt));

    return {
      job: {
        ...toJobDTO(job),
        description: descRow?.cleanText ?? descRow?.rawImportText ?? null,
        rawImportText: descRow?.rawImportText ?? null,
        latestScore: scores[0] ? toScoreDTO(scores[0]) : null,
        skills: skills.map(toSkillDTO),
        documents: docs.map(toDocDTO),
        notes: notesRows.map(toNoteDTO),
        events: events.map(toEventDTO),
        tags: [],
      },
    };
  });

  // Create (manual)
  app.post("/", async (req, reply) => {
    const user = app.requireUser(req);
    const input = jobInputSchema.parse(req.body);
    const hashKey = dedupeHash({
      title: input.title,
      company: input.company,
      location: input.location,
      url: input.sourceUrl,
    });
    const [job] = await app.db
      .insert(schema.jobs)
      .values({
        userId: user.id,
        title: input.title,
        company: input.company ?? null,
        location: input.location ?? null,
        workType: input.workType,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        salaryText: input.salaryText ?? null,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        applyUrl: input.applyUrl ?? input.sourceUrl ?? null,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,
        dedupeHash: hashKey,
      })
      .returning();
    if (input.description || input.rawImportText) {
      await app.db.insert(schema.jobDescriptions).values({
        jobId: job!.id,
        rawImportText: input.rawImportText ?? input.description ?? null,
        cleanText: input.description ?? input.rawImportText ?? null,
      });
    }
    await app.db.insert(schema.applicationEvents).values({ jobId: job!.id, userId: user.id, type: "imported" });
    return reply.status(201).send({ job: toJobDTO(job!) });
  });

  // Patch fields
  app.patch("/:id", async (req) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const patch = jobPatchSchema.parse(req.body);
    const [existing] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)));
    if (!existing) throw notFound("Job");
    const [job] = await app.db
      .update(schema.jobs)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.company !== undefined ? { company: patch.company } : {}),
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.workType !== undefined ? { workType: patch.workType } : {}),
        ...(patch.salaryMin !== undefined ? { salaryMin: patch.salaryMin } : {}),
        ...(patch.salaryMax !== undefined ? { salaryMax: patch.salaryMax } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, id))
      .returning();
    return { job: toJobDTO(job!) };
  });

  // Status change (+ event)
  app.patch("/:id/status", async (req) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const { status } = jobStatusPatchSchema.parse(req.body);
    const [existing] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)));
    if (!existing) throw notFound("Job");
    const [job] = await app.db
      .update(schema.jobs)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .returning();
    await app.db.insert(schema.applicationEvents).values({
      jobId: id,
      userId: user.id,
      type: "status_changed",
      payload: { from: existing.status, to: status },
    });
    return { job: toJobDTO(job!) };
  });

  // Delete
  app.delete("/:id", async (req, reply) => {
    const user = app.requireUser(req);
    const { id } = req.params as { id: string };
    const res = await app.db
      .delete(schema.jobs)
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)))
      .returning({ id: schema.jobs.id });
    if (res.length === 0) throw notFound("Job");
    return reply.status(204).send();
  });
}
