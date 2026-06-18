import { schema } from "@jobpilot/db";
import { JOB_STATUSES, noteSchema, reminderSchema, trackerEventSchema } from "@jobpilot/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { notFound } from "../lib/errors.js";
import { toEventDTO, toJobDTO, toNoteDTO, toReminderDTO } from "../lib/mappers.js";

export default async function trackerRoutes(app: FastifyInstance) {
  // Kanban board: jobs grouped by status
  app.get("/board", async (req) => {
    const user = app.requireUser(req);
    const jobs = await app.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.userId, user.id))
      .orderBy(desc(schema.jobs.matchScore));
    const columns = JOB_STATUSES.map((status) => ({
      status,
      cards: jobs.filter((j) => j.status === status).map(toJobDTO),
    }));
    return { columns };
  });

  // Append a timeline event (e.g. opened_apply, marked_applied)
  app.post("/:jobId/event", async (req, reply) => {
    const user = app.requireUser(req);
    const { jobId } = req.params as { jobId: string };
    const { type, payload } = trackerEventSchema.parse(req.body);
    const [job] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, user.id)));
    if (!job) throw notFound("Job");

    const [event] = await app.db
      .insert(schema.applicationEvents)
      .values({ jobId, userId: user.id, type, payload: payload ?? null })
      .returning();

    // Convenience: marking applied also advances the job status + applied date.
    if (type === "marked_applied") {
      await app.db
        .update(schema.jobs)
        .set({ status: "applied", updatedAt: new Date() })
        .where(eq(schema.jobs.id, jobId));
      await app.db
        .insert(schema.applications)
        .values({ jobId, userId: user.id, status: "applied", dateApplied: new Date() })
        .onConflictDoUpdate({
          target: schema.applications.jobId,
          set: { status: "applied", dateApplied: new Date(), updatedAt: new Date() },
        });
    }
    return reply.status(201).send({ event: toEventDTO(event!) });
  });

  app.get("/:jobId/timeline", async (req) => {
    const user = app.requireUser(req);
    const { jobId } = req.params as { jobId: string };
    const rows = await app.db
      .select()
      .from(schema.applicationEvents)
      .where(and(eq(schema.applicationEvents.jobId, jobId), eq(schema.applicationEvents.userId, user.id)))
      .orderBy(desc(schema.applicationEvents.createdAt));
    return { items: rows.map(toEventDTO) };
  });

  // Reminders
  app.get("/reminders", async (req) => {
    const user = app.requireUser(req);
    const rows = await app.db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.userId, user.id))
      .orderBy(schema.reminders.remindAt);
    return { items: rows.map(toReminderDTO) };
  });

  app.post("/reminders", async (req, reply) => {
    const user = app.requireUser(req);
    const input = reminderSchema.parse(req.body);
    const [row] = await app.db
      .insert(schema.reminders)
      .values({
        userId: user.id,
        jobId: input.jobId,
        remindAt: new Date(input.remindAt),
        message: input.message ?? null,
      })
      .returning();
    await app.db
      .insert(schema.applicationEvents)
      .values({ jobId: input.jobId, userId: user.id, type: "reminder_set", payload: { remindAt: input.remindAt } });
    return reply.status(201).send({ reminder: toReminderDTO(row!) });
  });

  // Notes (registered under /api/jobs as well via index)
  app.post("/:jobId/notes", async (req, reply) => {
    const user = app.requireUser(req);
    const { jobId } = req.params as { jobId: string };
    const { body } = noteSchema.parse(req.body);
    const [job] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, user.id)));
    if (!job) throw notFound("Job");
    const [note] = await app.db.insert(schema.notes).values({ userId: user.id, jobId, body }).returning();
    await app.db.insert(schema.applicationEvents).values({ jobId, userId: user.id, type: "note_added" });
    return reply.status(201).send({ note: toNoteDTO(note!) });
  });
}
