/**
 * Ollama-backed analysis provider — runs a local model (e.g. llama3) with no API
 * key or cloud calls. Uses Ollama's /api/chat with JSON mode and validates the
 * output against the same Zod schemas as every other provider.
 *
 * Like the Anthropic provider, every method falls back to the deterministic
 * heuristic engine on any error (daemon down, bad JSON, schema mismatch), so the
 * app never breaks. Default endpoint http://localhost:11434, default model llama3.
 */
import {
  extractedJobSchema,
  generatedDocSchema,
  scoreResultSchema,
  type ExtractedJob,
  type GeneratedDoc,
  type ScoreResult,
  type ScoringWeights,
} from "@jobpilot/shared";
import { parseJobText } from "../parsing/jobText.js";
import { scoreJob as heuristicScoreJob, type ScoreJob, type ScoreProfile } from "../scoring/heuristic.js";
import { DOCUMENT_LABELS, generateDocumentHeuristic, type DocGenInput } from "./documents.js";
import type { JobAnalysisProvider } from "./provider.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3";

/** Same "never invent experience" rules as the cloud providers (docs/PROMPTS.md). */
const SYSTEM = `You are JobPilot's analysis engine for a single job seeker.
RULES:
- Never invent experience, skills, certifications, or employment the user does not have.
- Clearly separate FACTS (present in the provided profile/job) from ASSUMPTIONS or SUGGESTIONS.
- When information is missing or ambiguous, say so and lower your confidence — never guess silently.
- Output ONLY a single JSON object matching the requested shape — no markdown, no commentary.
- Include a confidence (0-1) and a warnings array when data is incomplete.
- You assist with applying manually; you never submit anything.`;

const PROMPT_VERSION = "ollama-2026-06";

export class OllamaProvider implements JobAnalysisProvider {
  readonly name = "ollama" as const;
  private baseUrl: string;
  private model: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = model ?? DEFAULT_MODEL;
  }

  /** POST /api/chat in JSON mode and return the parsed object (throws on failure). */
  private async chatJson(userContent: string, maxTokens: number): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json",
        options: { temperature: 0.2, num_predict: maxTokens },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return JSON.parse(data.message?.content ?? "");
  }

  async extractJob(text: string, sourceUrl?: string): Promise<ExtractedJob> {
    try {
      const raw = await this.chatJson(
        "Extract job fields from the text below into a FLAT JSON object with EXACTLY these " +
          "top-level keys (do not nest them under any other key):\n" +
          '  title (string), company (string|null), location (string|null, a plain string e.g. "Richmond, VIC"),\n' +
          '  workType ("onsite"|"hybrid"|"remote"|"unknown"), salaryMin (number|null), salaryMax (number|null),\n' +
          "  salaryText (string|null), applyUrl (string|null), sourceUrl (string|null), closingDate (string|null),\n" +
          "  requiredSkills (string[]), summary (string), confidence (number 0-1), warnings (string[]).\n" +
          "Set unknown fields to null; never fabricate a salary, company, or URL.\n" +
          (sourceUrl ? `Source URL: ${sourceUrl}\n` : "") +
          `\n---\n${text.slice(0, 20000)}\n---`,
        2048,
      );
      const parsed = extractedJobSchema.parse(raw);
      if (sourceUrl && !parsed.sourceUrl) parsed.sourceUrl = sourceUrl;
      return parsed;
    } catch (err) {
      const fallback = parseJobText(text, sourceUrl);
      fallback.warnings = [...fallback.warnings, `AI extraction unavailable (${errMsg(err)}); used heuristic parser.`];
      return fallback;
    }
  }

  async scoreJob(
    profile: ScoreProfile,
    job: ScoreJob,
    weights?: Partial<ScoringWeights>,
  ): Promise<ScoreResult> {
    try {
      const payload = {
        profile,
        job: {
          title: job.title,
          description: job.description ?? null,
          location: job.location ?? null,
          workType: job.workType,
          salaryMin: job.salaryMin ?? null,
          salaryMax: job.salaryMax ?? null,
        },
        scoringWeights: weights ?? null,
        promptVersion: PROMPT_VERSION,
      };
      const raw = await this.chatJson(
        "Score this job for the candidate, 0-100, using category weights " +
          "(role, skills, location, experience, salary, effort). Location: Melbourne priority areas > nearby " +
          "> remote/hybrid > far. matchedSkills/transferableSkills must come only from the profile; " +
          "missingSkills are required-but-absent. Recommendation: apply (>=72) | consider (>=50) | skip. " +
          "Never claim a skill the profile lacks. Respond as JSON matching the score schema.\n\n" +
          JSON.stringify(payload),
        2048,
      );
      return scoreResultSchema.parse(raw);
    } catch (err) {
      const fallback = heuristicScoreJob(profile, job, weights);
      fallback.warnings = [...fallback.warnings, `AI scoring unavailable (${errMsg(err)}); used heuristic engine.`];
      return fallback;
    }
  }

  async generateDocument(input: DocGenInput): Promise<GeneratedDoc> {
    const kindInstructions: Record<DocGenInput["kind"], string> = {
      resume_notes:
        "Produce tailored resume guidance: a rewritten summary, 3-5 suggested bullet edits (reframing real experience only), and keywords to include.",
      cover_letter:
        "Write a concise, specific cover letter (3 short paragraphs) plus a one-line short application message at the end.",
      screening_answers:
        "Answer the screening questions truthfully from the profile. If an honest answer requires a skill the profile lacks, say so plainly.",
      interview_prep:
        "Produce interview talking points and likely questions with honest, profile-grounded answer outlines.",
    };
    try {
      const payload = {
        kind: input.kind,
        tone: input.tone ?? "professional, warm, direct",
        profile: input.profile,
        job: input.job,
        context: input.context,
        screeningQuestions: input.screeningQuestions ?? [],
      };
      const raw = await this.chatJson(
        `Generate a "${DOCUMENT_LABELS[input.kind]}" document for this job application. ` +
          `${kindInstructions[input.kind]} ` +
          "Use markdown for bodyMarkdown. Only reference skills and experience present in the profile. " +
          "Put every job-required skill the profile lacks into doNotClaim, and never imply the candidate has it. " +
          "Set keywordsToInclude to ATS keywords from the job the candidate genuinely matches. Respond as JSON " +
          "matching the document schema.\n\n" +
          JSON.stringify(payload),
        3072,
      );
      return generatedDocSchema.parse(raw);
    } catch (err) {
      const fallback = generateDocumentHeuristic(input);
      fallback.warnings = [...fallback.warnings, `AI generation unavailable (${errMsg(err)}); used heuristic generator.`];
      return fallback;
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "error";
}
