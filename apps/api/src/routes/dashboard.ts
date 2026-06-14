import { schema } from "@jobpilot/db";
import type { DashboardSummaryDTO } from "@jobpilot/shared";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { toJobDTO } from "../lib/mappers.js";

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/summary", async (req): Promise<DashboardSummaryDTO> => {
    const user = app.requireUser(req);
    const base = eq(schema.jobs.userId, user.id);

    const countWhere = async (cond: ReturnType<typeof and>) => {
      const rows = await app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.jobs)
        .where(cond);
      return rows[0]?.count ?? 0;
    };

    const newJobs = await countWhere(and(base, eq(schema.jobs.status, "new")));
    const goodMatches = await countWhere(and(base, gte(schema.jobs.matchScore, 72)));
    const applied = await countWhere(and(base, inArray(schema.jobs.status, ["applied", "follow_up", "interview", "offer"])));
    const interviews = await countWhere(and(base, eq(schema.jobs.status, "interview")));

    const followUpRows = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.userId, user.id),
          eq(schema.reminders.done, false),
          lte(schema.reminders.remindAt, new Date()),
        ),
      );
    const followUpsDue = followUpRows[0]?.count ?? 0;

    const recent = await app.db
      .select()
      .from(schema.jobs)
      .where(base)
      .orderBy(desc(schema.jobs.matchScore))
      .limit(8);

    return {
      newJobs,
      goodMatches,
      applied,
      interviews,
      followUpsDue: followUpsDue ?? 0,
      recentJobs: recent.map(toJobDTO),
    };
  });
}
