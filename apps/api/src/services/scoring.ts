import { getProvider, type ScoreJob, type ScoreProfile } from "@jobpilot/core";
import { schema, type Database } from "@jobpilot/db";
import type { SkillEntry } from "@jobpilot/shared";
import { eq } from "drizzle-orm";
import { loadEnv } from "../lib/env.js";

/** Build the core ScoreProfile from a stored profile row (or sensible defaults). */
function buildScoreProfile(
  profile: typeof schema.profiles.$inferSelect | undefined,
): ScoreProfile {
  if (!profile) {
    return { skills: [], targetRoles: [], acceptRemote: true, acceptHybrid: true, acceptCbd: true };
  }
  const skills = ((profile.skills as SkillEntry[]) ?? []).map((s) => s.name);
  return {
    skills,
    targetRoles: profile.targetRoles ?? [],
    acceptRemote: profile.acceptRemote,
    acceptHybrid: profile.acceptHybrid,
    acceptCbd: profile.acceptCbd,
    targetLocations: profile.targetLocations ?? [],
    salaryGoalMin: profile.salaryGoalMin,
    salaryGoalMax: profile.salaryGoalMax,
  };
}

/**
 * Score a job for a user: loads the profile + job, runs the AI/heuristic provider,
 * persists the result to job_scores + job_skills, updates the denormalised job
 * fields, and records a `scored` event. Returns the score row.
 */
export async function scoreJobForUser(db: Database, userId: string, jobId: string) {
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId));
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) throw new Error("Job not found for scoring");

  const [desc] = await db
    .select()
    .from(schema.jobDescriptions)
    .where(eq(schema.jobDescriptions.jobId, jobId));

  const scoreJob: ScoreJob = {
    title: job.title,
    description: desc?.cleanText ?? desc?.rawImportText ?? null,
    location: job.location,
    workType: job.workType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
  };

  const provider = getProvider(loadEnv());
  const result = await provider.scoreJob(buildScoreProfile(profile), scoreJob);

  const [scoreRow] = await db
    .insert(schema.jobScores)
    .values({
      jobId,
      provider: provider.name,
      score: result.score,
      recommendation: result.recommendation,
      reason: result.reason,
      categoryScores: result.categoryScores,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      risks: result.risks,
      resumeStrategy: result.resumeStrategy,
      coverLetterAngle: result.coverLetterAngle,
      interviewPoints: result.interviewPoints,
      confidence: String(result.confidence),
      warnings: result.warnings,
      rawResponse: result as unknown as Record<string, unknown>,
    })
    .returning();

  // Refresh normalized job_skills.
  await db.delete(schema.jobSkills).where(eq(schema.jobSkills.jobId, jobId));
  const skillRows = [
    ...result.matchedSkills.map((name) => ({ jobId, name, required: true, matched: true })),
    ...result.missingSkills.map((name) => ({ jobId, name, required: true, matched: false })),
  ];
  if (skillRows.length) await db.insert(schema.jobSkills).values(skillRows);

  await db
    .update(schema.jobs)
    .set({ matchScore: result.score, recommendation: result.recommendation, updatedAt: new Date() })
    .where(eq(schema.jobs.id, jobId));

  await db.insert(schema.applicationEvents).values({
    jobId,
    userId,
    type: "scored",
    payload: { score: result.score, recommendation: result.recommendation, provider: provider.name },
  });

  return scoreRow!;
}
