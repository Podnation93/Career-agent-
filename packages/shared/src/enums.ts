/**
 * Canonical enum value sets, shared by the DB schema, API validation, and UI.
 * Keep these in sync with the Postgres enums declared in @jobpilot/db.
 */

export const WORK_TYPES = ["onsite", "hybrid", "remote", "unknown"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const JOB_SOURCES = [
  "gmail",
  "manual_url",
  "manual_text",
  "manual_file",
  "extension",
  "feed",
  "seek",
] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const JOB_STATUSES = [
  "new",
  "to_review",
  "good_match",
  "maybe",
  "not_suitable",
  "prepared",
  "applied",
  "follow_up",
  "interview",
  "rejected",
  "offer",
  "archived",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Human-friendly labels for statuses (used in the UI). */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  new: "New",
  to_review: "To Review",
  good_match: "Good Match",
  maybe: "Maybe",
  not_suitable: "Not Suitable",
  prepared: "Prepared",
  applied: "Applied",
  follow_up: "Follow Up",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
  archived: "Archived",
};

export const RECOMMENDATIONS = ["apply", "consider", "skip"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const DOCUMENT_KINDS = [
  "resume_notes",
  "cover_letter",
  "screening_answers",
  "interview_prep",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const EVENT_TYPES = [
  "imported",
  "reviewed",
  "scored",
  "resume_generated",
  "cover_letter_generated",
  "opened_apply",
  "marked_applied",
  "marked_not_applied",
  "reminder_set",
  "interview_added",
  "rejected",
  "offer_received",
  "status_changed",
  "note_added",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const AI_PROVIDERS = ["heuristic", "anthropic", "openai", "ollama"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const GMAIL_CONN_STATUSES = ["active", "revoked", "error"] as const;
export type GmailConnStatus = (typeof GMAIL_CONN_STATUSES)[number];

/** Scoring category keys (must match ScoringWeights). */
export const SCORE_CATEGORIES = [
  "role",
  "skills",
  "location",
  "experience",
  "salary",
  "effort",
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];
