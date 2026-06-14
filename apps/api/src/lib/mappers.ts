/** Map Drizzle row shapes to the DTOs in @jobpilot/shared (dates → ISO strings). */
import type {
  ApplicationEventDTO,
  GeneratedDocumentDTO,
  JobDTO,
  JobScoreDTO,
  JobSkillDTO,
  NoteDTO,
  ProfileDTO,
  ReminderDTO,
} from "@jobpilot/shared";
import type { schema } from "@jobpilot/db";

type JobRow = typeof schema.jobs.$inferSelect;
type ScoreRow = typeof schema.jobScores.$inferSelect;
type SkillRow = typeof schema.jobSkills.$inferSelect;
type DocRow = typeof schema.generatedDocuments.$inferSelect;
type NoteRow = typeof schema.notes.$inferSelect;
type EventRow = typeof schema.applicationEvents.$inferSelect;
type ReminderRow = typeof schema.reminders.$inferSelect;
type ProfileRow = typeof schema.profiles.$inferSelect;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function toJobDTO(j: JobRow): JobDTO {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    workType: j.workType,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryText: j.salaryText,
    source: j.source,
    sourceUrl: j.sourceUrl,
    applyUrl: j.applyUrl,
    matchScore: j.matchScore,
    recommendation: j.recommendation,
    status: j.status,
    dateFound: j.dateFound.toISOString(),
    closingDate: iso(j.closingDate),
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

export function toScoreDTO(s: ScoreRow): JobScoreDTO {
  return {
    id: s.id,
    jobId: s.jobId,
    provider: s.provider,
    score: s.score,
    recommendation: s.recommendation,
    reason: s.reason,
    categoryScores: (s.categoryScores as JobScoreDTO["categoryScores"]) ?? {
      role: 0,
      skills: 0,
      location: 0,
      experience: 0,
      salary: 0,
      effort: 0,
    },
    matchedSkills: s.matchedSkills,
    missingSkills: s.missingSkills,
    transferableSkills: [],
    risks: s.risks,
    resumeStrategy: s.resumeStrategy,
    coverLetterAngle: s.coverLetterAngle,
    interviewPoints: s.interviewPoints,
    confidence: s.confidence ? Number(s.confidence) : 0.5,
    warnings: s.warnings,
    createdAt: s.createdAt.toISOString(),
  };
}

export const toSkillDTO = (s: SkillRow): JobSkillDTO => ({
  id: s.id,
  name: s.name,
  required: s.required,
  matched: s.matched,
});

export const toDocDTO = (d: DocRow): GeneratedDocumentDTO => ({
  id: d.id,
  jobId: d.jobId,
  kind: d.kind,
  title: d.title,
  body: d.body,
  provider: d.provider,
  metadata: d.metadata ?? null,
  createdAt: d.createdAt.toISOString(),
});

export const toNoteDTO = (n: NoteRow): NoteDTO => ({
  id: n.id,
  jobId: n.jobId,
  body: n.body,
  createdAt: n.createdAt.toISOString(),
});

export const toEventDTO = (e: EventRow): ApplicationEventDTO => ({
  id: e.id,
  jobId: e.jobId,
  type: e.type,
  payload: e.payload ?? null,
  createdAt: e.createdAt.toISOString(),
});

export const toReminderDTO = (r: ReminderRow): ReminderDTO => ({
  id: r.id,
  jobId: r.jobId ?? "",
  remindAt: r.remindAt.toISOString(),
  message: r.message,
  done: r.done,
  createdAt: r.createdAt.toISOString(),
});

export function toProfileDTO(p: ProfileRow): ProfileDTO {
  return {
    id: p.id,
    headline: p.headline,
    summary: p.summary,
    skills: (p.skills as ProfileDTO["skills"]) ?? [],
    experience: (p.experience as ProfileDTO["experience"]) ?? [],
    targetRoles: p.targetRoles,
    targetLocations: p.targetLocations,
    acceptRemote: p.acceptRemote,
    acceptHybrid: p.acceptHybrid,
    acceptCbd: p.acceptCbd,
    salaryGoalMin: p.salaryGoalMin,
    salaryGoalMax: p.salaryGoalMax,
    careerGoals: p.careerGoals,
    scoringWeights: p.scoringWeights ?? null,
  };
}
