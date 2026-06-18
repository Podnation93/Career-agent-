import { z } from "zod";
import {
  AI_PROVIDERS,
  DOCUMENT_KINDS,
  EVENT_TYPES,
  JOB_SOURCES,
  JOB_STATUSES,
  RECOMMENDATIONS,
  WORK_TYPES,
} from "./enums";

/* ── Primitives ─────────────────────────────────────────────── */

export const workTypeSchema = z.enum(WORK_TYPES);
export const jobSourceSchema = z.enum(JOB_SOURCES);
export const jobStatusSchema = z.enum(JOB_STATUSES);
export const recommendationSchema = z.enum(RECOMMENDATIONS);
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export const eventTypeSchema = z.enum(EVENT_TYPES);
export const aiProviderSchema = z.enum(AI_PROVIDERS);

/* ── Auth ───────────────────────────────────────────────────── */

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* ── Profile ────────────────────────────────────────────────── */

export const skillEntrySchema = z.object({
  name: z.string().min(1),
  level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  years: z.number().min(0).max(60).optional(),
});
export type SkillEntry = z.infer<typeof skillEntrySchema>;

export const experienceEntrySchema = z.object({
  title: z.string().min(1),
  company: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;

export const scoringWeightsSchema = z.object({
  role: z.number().min(0).max(1).default(0.2),
  skills: z.number().min(0).max(1).default(0.3),
  location: z.number().min(0).max(1).default(0.2),
  experience: z.number().min(0).max(1).default(0.15),
  salary: z.number().min(0).max(1).default(0.1),
  effort: z.number().min(0).max(1).default(0.05),
});
export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;

export const profileSchema = z.object({
  headline: z.string().max(200).optional(),
  summary: z.string().max(5000).optional(),
  skills: z.array(skillEntrySchema).default([]),
  experience: z.array(experienceEntrySchema).default([]),
  targetRoles: z.array(z.string()).default([]),
  targetLocations: z.array(z.string()).default([]),
  acceptRemote: z.boolean().default(true),
  acceptHybrid: z.boolean().default(true),
  acceptCbd: z.boolean().default(true),
  salaryGoalMin: z.number().int().min(0).optional(),
  salaryGoalMax: z.number().int().min(0).optional(),
  careerGoals: z.string().max(5000).optional(),
  scoringWeights: scoringWeightsSchema.partial().optional(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

/* ── Jobs ───────────────────────────────────────────────────── */

export const jobInputSchema = z.object({
  title: z.string().min(1).max(300),
  company: z.string().max(300).optional(),
  location: z.string().max(300).optional(),
  workType: workTypeSchema.default("unknown"),
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
  salaryText: z.string().max(200).optional(),
  source: jobSourceSchema,
  sourceUrl: z.string().url().optional(),
  applyUrl: z.string().url().optional(),
  description: z.string().optional(),
  rawImportText: z.string().optional(),
  closingDate: z.string().datetime().optional(),
});
export type JobInput = z.infer<typeof jobInputSchema>;

export const jobPatchSchema = jobInputSchema.partial().extend({
  status: jobStatusSchema.optional(),
});
export type JobPatch = z.infer<typeof jobPatchSchema>;

export const jobStatusPatchSchema = z.object({ status: jobStatusSchema });

export const jobListQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  source: jobSourceSchema.optional(),
  workType: workTypeSchema.optional(),
  location: z.string().optional(),
  company: z.string().optional(),
  q: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  hasMissingSkills: z.coerce.boolean().optional(),
  sort: z.enum(["score", "newest", "salary", "location"]).default("score"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;

/* ── Import ─────────────────────────────────────────────────── */

export const manualImportSchema = z
  .object({
    kind: z.enum(["url", "text", "file"]),
    url: z.string().url().optional(),
    text: z.string().optional(),
    fileBase64: z.string().optional(),
    filename: z.string().optional(),
  })
  .refine(
    (v) =>
      (v.kind === "url" && !!v.url) ||
      (v.kind === "text" && !!v.text) ||
      (v.kind === "file" && !!v.fileBase64),
    { message: "Provide the field matching the chosen kind." },
  );
export type ManualImportInput = z.infer<typeof manualImportSchema>;

/* ── Scoring (AI/heuristic output contract) ─────────────────── */

export const categoryScoresSchema = z.object({
  role: z.number().min(0).max(100),
  skills: z.number().min(0).max(100),
  location: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  salary: z.number().min(0).max(100),
  effort: z.number().min(0).max(100),
});

export const scoreResultSchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: recommendationSchema,
  reason: z.string(),
  categoryScores: categoryScoresSchema,
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  transferableSkills: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  resumeStrategy: z.string().default(""),
  coverLetterAngle: z.string().default(""),
  interviewPoints: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string()).default([]),
});
export type ScoreResult = z.infer<typeof scoreResultSchema>;

/* ── Extraction (AI output contract for P1) ─────────────────── */

export const extractedJobSchema = z.object({
  title: z.string(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  workType: workTypeSchema.default("unknown"),
  salaryMin: z.number().nullable().optional(),
  salaryMax: z.number().nullable().optional(),
  salaryText: z.string().nullable().optional(),
  applyUrl: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  closingDate: z.string().nullable().optional(),
  requiredSkills: z.array(z.string()).default([]),
  summary: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string()).default([]),
});
export type ExtractedJob = z.infer<typeof extractedJobSchema>;

/* ── Documents ──────────────────────────────────────────────── */

export const generateDocumentSchema = z.object({
  kind: documentKindSchema,
  tone: z.string().max(60).optional(),
  screeningQuestions: z.array(z.string()).optional(),
  options: z.record(z.unknown()).optional(),
});
export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;

/**
 * Contract for a generated application document (P3/P4/P5 + interview prep).
 * The body is markdown; the safety arrays enforce the "never invent" rule —
 * `doNotClaim` lists job-required skills absent from the profile.
 */
export const generatedDocSchema = z.object({
  title: z.string(),
  bodyMarkdown: z.string(),
  keywordsToInclude: z.array(z.string()).default([]),
  doNotClaim: z.array(z.string()).default([]),
  flaggedGaps: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string()).default([]),
});
export type GeneratedDoc = z.infer<typeof generatedDocSchema>;

/* ── Tracker ────────────────────────────────────────────────── */

export const trackerEventSchema = z.object({
  type: eventTypeSchema,
  payload: z.record(z.unknown()).optional(),
});
export type TrackerEventInput = z.infer<typeof trackerEventSchema>;

export const reminderSchema = z.object({
  jobId: z.string().uuid(),
  remindAt: z.string().datetime(),
  message: z.string().max(500).optional(),
});
export type ReminderInput = z.infer<typeof reminderSchema>;

export const noteSchema = z.object({ body: z.string().min(1).max(5000) });

/* ── Settings ───────────────────────────────────────────────── */

export const aiSettingsSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().optional(),
});

export const deleteAllSchema = z.object({ password: z.string().min(1) });
