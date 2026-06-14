/**
 * AI provider abstraction. Phase 1 ships the deterministic `heuristic` provider;
 * `anthropic` and `openai` implement the same interface in Phase 2. Every method
 * is contracted to fall back to the heuristic engine on any failure, so the app
 * never breaks when AI is unavailable.
 */
import type {
  AiProvider,
  ExtractedJob,
  ScoreResult,
  ScoringWeights,
} from "@jobpilot/shared";
import { parseJobText } from "../parsing/jobText.js";
import { scoreJob, type ScoreJob, type ScoreProfile } from "../scoring/heuristic.js";

export interface JobAnalysisProvider {
  readonly name: AiProvider;
  extractJob(text: string, sourceUrl?: string): Promise<ExtractedJob>;
  scoreJob(
    profile: ScoreProfile,
    job: ScoreJob,
    weights?: Partial<ScoringWeights>,
  ): Promise<ScoreResult>;
}

/** Deterministic provider: no network, no API key, used as default + fallback. */
export class HeuristicProvider implements JobAnalysisProvider {
  readonly name = "heuristic" as const;

  async extractJob(text: string, sourceUrl?: string): Promise<ExtractedJob> {
    return parseJobText(text, sourceUrl);
  }

  async scoreJob(
    profile: ScoreProfile,
    job: ScoreJob,
    weights?: Partial<ScoringWeights>,
  ): Promise<ScoreResult> {
    return scoreJob(profile, job, weights);
  }
}

export interface ProviderEnv {
  AI_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

/**
 * Select a provider from env. Phase 1 always resolves to the heuristic provider;
 * Phase 2 returns Anthropic/OpenAI implementations when keys are present.
 */
export function getProvider(env: ProviderEnv = process.env): JobAnalysisProvider {
  const want = (env.AI_PROVIDER ?? "heuristic").toLowerCase();
  switch (want) {
    case "anthropic":
    case "openai":
      // Phase 2: return the hosted provider here (wrapped to fall back to heuristic).
      // Until implemented, use the deterministic engine so the app stays functional.
      return new HeuristicProvider();
    default:
      return new HeuristicProvider();
  }
}
