import {
  AI_PROVIDERS,
  DOCUMENT_KINDS,
  EVENT_TYPES,
  GMAIL_CONN_STATUSES,
  JOB_SOURCES,
  JOB_STATUSES,
  RECOMMENDATIONS,
  WORK_TYPES,
} from "@jobpilot/shared";
import { relations } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ── Enums ──────────────────────────────────────────────────── */
export const workTypeEnum = pgEnum("work_type", [...WORK_TYPES]);
export const jobSourceEnum = pgEnum("job_source", [...JOB_SOURCES]);
export const jobStatusEnum = pgEnum("job_status", [...JOB_STATUSES]);
export const recommendationEnum = pgEnum("recommendation", [...RECOMMENDATIONS]);
export const documentKindEnum = pgEnum("document_kind", [...DOCUMENT_KINDS]);
export const eventTypeEnum = pgEnum("event_type", [...EVENT_TYPES]);
export const aiProviderEnum = pgEnum("ai_provider", [...AI_PROVIDERS]);
export const gmailConnStatusEnum = pgEnum("gmail_conn_status", [...GMAIL_CONN_STATUSES]);

/** bytea column type for encrypted blobs. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = ts("created_at").notNull().defaultNow();
const updatedAt = ts("updated_at").notNull().defaultNow();

/* ── Users / sessions ──────────────────────────────────────── */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  createdAt,
  updatedAt,
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    createdAt,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ── Profile / resumes / templates ─────────────────────────── */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  headline: text("headline"),
  summary: text("summary"),
  skills: jsonb("skills").$type<unknown[]>().notNull().default([]),
  experience: jsonb("experience").$type<unknown[]>().notNull().default([]),
  targetRoles: text("target_roles").array().notNull().default([]),
  targetLocations: text("target_locations").array().notNull().default([]),
  acceptRemote: boolean("accept_remote").notNull().default(true),
  acceptHybrid: boolean("accept_hybrid").notNull().default(true),
  acceptCbd: boolean("accept_cbd").notNull().default(true),
  salaryGoalMin: integer("salary_goal_min"),
  salaryGoalMax: integer("salary_goal_max"),
  careerGoals: text("career_goals"),
  scoringWeights: jsonb("scoring_weights").$type<Record<string, number>>(),
  createdAt,
  updatedAt,
});

export const resumes = pgTable("resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  content: text("content").notNull().default(""),
  isBase: boolean("is_base").notNull().default(false),
  createdAt,
});

export const coverLetterTemplates = pgTable("cover_letter_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  body: text("body").notNull().default(""),
  tone: text("tone"),
  createdAt,
});

export const jobSources = pgTable("job_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: jobSourceEnum("kind").notNull(),
  label: text("label").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  createdAt,
});

/* ── Jobs and children ─────────────────────────────────────── */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company"),
    location: text("location"),
    workType: workTypeEnum("work_type").notNull().default("unknown"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryText: text("salary_text"),
    source: jobSourceEnum("source").notNull(),
    sourceUrl: text("source_url"),
    applyUrl: text("apply_url"),
    dateFound: ts("date_found").notNull().defaultNow(),
    closingDate: ts("closing_date"),
    matchScore: integer("match_score"),
    recommendation: recommendationEnum("recommendation"),
    status: jobStatusEnum("status").notNull().default("new"),
    dedupeHash: text("dedupe_hash").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("jobs_user_status_idx").on(t.userId, t.status),
    index("jobs_user_score_idx").on(t.userId, t.matchScore),
    uniqueIndex("jobs_user_dedupe_idx").on(t.userId, t.dedupeHash),
  ],
);

export const jobDescriptions = pgTable("job_descriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  rawImportText: text("raw_import_text"),
  cleanText: text("clean_text"),
  html: text("html"),
  capturedAt: ts("captured_at").notNull().defaultNow(),
});

export const jobScores = pgTable("job_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  provider: aiProviderEnum("provider").notNull(),
  score: integer("score").notNull(),
  recommendation: recommendationEnum("recommendation").notNull(),
  reason: text("reason").notNull().default(""),
  categoryScores: jsonb("category_scores").$type<Record<string, number>>().notNull().default({}),
  matchedSkills: text("matched_skills").array().notNull().default([]),
  missingSkills: text("missing_skills").array().notNull().default([]),
  risks: text("risks").array().notNull().default([]),
  resumeStrategy: text("resume_strategy").notNull().default(""),
  coverLetterAngle: text("cover_letter_angle").notNull().default(""),
  interviewPoints: text("interview_points").array().notNull().default([]),
  confidence: numeric("confidence"),
  warnings: text("warnings").array().notNull().default([]),
  rawResponse: jsonb("raw_response").$type<Record<string, unknown>>(),
  createdAt,
});

export const jobSkills = pgTable("job_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(true),
  matched: boolean("matched").notNull().default(false),
});

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: jobStatusEnum("status").notNull().default("new"),
  dateApplied: ts("date_applied"),
  followUpDate: ts("follow_up_date"),
  interviewDate: ts("interview_date"),
  recruiterContact: text("recruiter_contact"),
  resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  coverLetterId: uuid("cover_letter_id").references(() => coverLetterTemplates.id, {
    onDelete: "set null",
  }),
  outcome: text("outcome"),
  notes: text("notes"),
  createdAt,
  updatedAt,
});

export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: eventTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => [index("events_job_idx").on(t.jobId)],
);

export const generatedDocuments = pgTable("generated_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: documentKindEnum("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  provider: aiProviderEnum("provider").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt,
});

/* ── Gmail / imports ───────────────────────────────────────── */
export const gmailConnections = pgTable("gmail_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  googleEmail: text("google_email"),
  accessTokenEnc: bytea("access_token_enc"),
  refreshTokenEnc: bytea("refresh_token_enc"),
  tokenIv: bytea("token_iv"),
  tokenTag: bytea("token_tag"),
  scope: text("scope"),
  status: gmailConnStatusEnum("status").notNull().default("active"),
  lastScanAt: ts("last_scan_at"),
  createdAt,
  updatedAt,
});

export const importedEmails = pgTable(
  "imported_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    fromAddr: text("from_addr"),
    subject: text("subject"),
    receivedAt: ts("received_at"),
    jobsExtracted: integer("jobs_extracted").notNull().default(0),
    processedAt: ts("processed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("imported_emails_user_msg_idx").on(t.userId, t.gmailMessageId)],
);

/* ── Reminders / notes / tags / audit ──────────────────────── */
export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  remindAt: ts("remind_at").notNull(),
  message: text("message"),
  done: boolean("done").notNull().default(false),
  createdAt,
});

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt,
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
});

export const jobTags = pgTable(
  "job_tags",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.tagId] })],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  ip: text("ip"),
  createdAt,
});

/* ── Relations ─────────────────────────────────────────────── */
export const jobsRelations = relations(jobs, ({ many, one }) => ({
  descriptions: many(jobDescriptions),
  scores: many(jobScores),
  skills: many(jobSkills),
  documents: many(generatedDocuments),
  events: many(applicationEvents),
  notes: many(notes),
  jobTags: many(jobTags),
  application: one(applications),
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
}));

export const jobTagsRelations = relations(jobTags, ({ one }) => ({
  job: one(jobs, { fields: [jobTags.jobId], references: [jobs.id] }),
  tag: one(tags, { fields: [jobTags.tagId], references: [tags.id] }),
}));

/* ── Inferred types ────────────────────────────────────────── */
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type JobScore = typeof jobScores.$inferSelect;
