/**
 * Anthropic-backed analysis provider. Implements P1 (extraction) and P2 (scoring)
 * from docs/PROMPTS.md using the official SDK with structured outputs
 * (`client.beta.messages.parse` + `betaZodOutputFormat`), so the model returns
 * JSON validated against the same Zod schemas the rest of the app uses.
 *
 * Every method falls back to the deterministic heuristic engine on any error
 * (missing key, network, refusal, schema-validation failure) — the app never
 * breaks when AI is unavailable. Default model: claude-opus-4-8.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  extractedJobSchema,
  scoreResultSchema,
  type ExtractedJob,
  type ScoreResult,
  type ScoringWeights,
} from "@jobpilot/shared";
import { parseJobText } from "../parsing/jobText.js";
import { scoreJob as heuristicScoreJob, type ScoreJob, type ScoreProfile } from "../scoring/heuristic.js";
import type { JobAnalysisProvider } from "./provider.js";

const DEFAULT_MODEL = "claude-opus-4-8";

/** Global system preamble — the "never invent experience" rules (docs/PROMPTS.md). */
const SYSTEM = `You are JobPilot's analysis engine for a single job seeker.
RULES:
- Never invent experience, skills, certifications, or employment the user does not have.
- Clearly separate FACTS (present in the provided profile/job) from ASSUMPTIONS or SUGGESTIONS.
- When information is missing or ambiguous, say so and lower your confidence — never guess silently.
- Output ONLY data matching the requested schema.
- Include a confidence (0-1) and a warnings array when data is incomplete.
- You assist with applying manually; you never submit anything.`;

const PROMPT_VERSION = "p2-2026-06";

export class AnthropicProvider implements JobAnalysisProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? DEFAULT_MODEL;
  }

  async extractJob(text: string, sourceUrl?: string): Promise<ExtractedJob> {
    try {
      const msg = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content:
              "Extract structured job fields from the text below. Set unknown fields to null; " +
              "never fabricate a salary, company, or URL.\n" +
              (sourceUrl ? `Source URL: ${sourceUrl}\n` : "") +
              `\n---\n${text.slice(0, 20000)}\n---`,
          },
        ],
        output_config: { format: betaZodOutputFormat(extractedJobSchema) },
      });
      const parsed = extractedJobSchema.parse(msg.parsed_output);
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
      const msg = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content:
              "Score this job for the candidate, 0-100, using these category weights " +
              "(role, skills, location, experience, salary, effort). Rubric: role fit (target-role match, " +
              "penalise too-senior/too-junior); skills fit (required vs profile, transferable); location fit " +
              "(Melbourne priority areas > nearby > remote/hybrid > far); experience fit (penalise excessive " +
              "years-of-experience asks; favour entry cyber/support); salary & progression; application effort. " +
              "matchedSkills/transferableSkills must come only from the profile. missingSkills are required-but-absent. " +
              "Recommendation: apply (>=72) | consider (>=50) | skip. Never claim a skill the profile lacks.\n\n" +
              `${JSON.stringify(payload)}`,
          },
        ],
        output_config: { format: betaZodOutputFormat(scoreResultSchema) },
      });
      return scoreResultSchema.parse(msg.parsed_output);
    } catch (err) {
      const fallback = heuristicScoreJob(profile, job, weights);
      fallback.warnings = [...fallback.warnings, `AI scoring unavailable (${errMsg(err)}); used heuristic engine.`];
      return fallback;
    }
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.status ?? ""} ${err.name}`.trim();
  return err instanceof Error ? err.name : "error";
}
