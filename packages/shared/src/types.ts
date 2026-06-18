/**
 * DTO types returned by the API and consumed by the web app.
 * These describe the shape over the wire (dates as ISO strings).
 */
import type {
  AiProvider,
  JobSource,
  JobStatus,
  Recommendation,
  WorkType,
  DocumentKind,
  EventType,
  GmailConnStatus,
} from "./enums";
import type { ScoreResult } from "./schemas";

export interface UserDTO {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  workType: WorkType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  source: JobSource;
  sourceUrl: string | null;
  applyUrl: string | null;
  matchScore: number | null;
  recommendation: Recommendation | null;
  status: JobStatus;
  dateFound: string;
  closingDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetailDTO extends JobDTO {
  description: string | null;
  rawImportText: string | null;
  latestScore: JobScoreDTO | null;
  skills: JobSkillDTO[];
  documents: GeneratedDocumentDTO[];
  notes: NoteDTO[];
  events: ApplicationEventDTO[];
  tags: TagDTO[];
}

export interface JobScoreDTO extends ScoreResult {
  id: string;
  jobId: string;
  provider: AiProvider;
  createdAt: string;
}

export interface JobSkillDTO {
  id: string;
  name: string;
  required: boolean;
  matched: boolean;
}

export interface GeneratedDocumentDTO {
  id: string;
  jobId: string;
  kind: DocumentKind;
  title: string;
  body: string;
  provider: AiProvider;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NoteDTO {
  id: string;
  jobId: string;
  body: string;
  createdAt: string;
}

export interface ApplicationEventDTO {
  id: string;
  jobId: string;
  type: EventType;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ReminderDTO {
  id: string;
  jobId: string;
  remindAt: string;
  message: string | null;
  done: boolean;
  createdAt: string;
}

export interface TagDTO {
  id: string;
  name: string;
  color: string | null;
}

export interface ProfileDTO {
  id: string;
  headline: string | null;
  summary: string | null;
  skills: { name: string; level?: string; years?: number }[];
  experience: {
    title: string;
    company?: string;
    start?: string;
    end?: string;
    bullets: string[];
  }[];
  targetRoles: string[];
  targetLocations: string[];
  acceptRemote: boolean;
  acceptHybrid: boolean;
  acceptCbd: boolean;
  salaryGoalMin: number | null;
  salaryGoalMax: number | null;
  careerGoals: string | null;
  scoringWeights: Record<string, number> | null;
}

export interface DashboardSummaryDTO {
  newJobs: number;
  goodMatches: number;
  applied: number;
  interviews: number;
  followUpsDue: number;
  recentJobs: JobDTO[];
}

export interface GmailStatusDTO {
  connected: boolean;
  googleEmail: string | null;
  lastScanAt: string | null;
  status: GmailConnStatus | null;
}

export interface PaginatedDTO<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
