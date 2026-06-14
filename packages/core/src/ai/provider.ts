/**
 * AI provider abstraction. Phase 1 ships the deterministic `heuristic` provider;
 * `anthropic` and `openai` implement the same interface in Phase 2. Every method
 * is contracted to fall back to the heuristic engine on any failure, so the app
 * never breaks when AI is unavailable.
 */
import type {
  AiProvider,
  ExtractedJob,
  GeneratedDoc,
  ScoreResult,
  ScoringWeights,
} from "@jobpilot/shared";
import { parseJobText } from "../parsing/jobText.js";
import { scoreJob, type ScoreJob, type ScoreProfile } from "../scoring/heuristic.js";
import { generateDocumentHeuristic, type DocGenInput } from "./documents.js";
import { AnthropicProvider } from "./anthropic.js";

export interface JobAnalysisProvider {
  readonly name: AiProvider;
  extractJob(text: string, sourceUrl?: string): Promise<ExtractedJob>;
  scoreJob(
    profile: ScoreProfile,
    job: ScoreJob,
    weights?: Partial<ScoringWeights>,
  ): Promise<ScoreResult>;
  generateDocument(input: DocGenInput): Promise<GeneratedDoc>;
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

  async generateDocument(input: DocGenInput): Promise<GeneratedDoc> {
    return generateDocumentHeuristic(input);
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
      if (env.ANTHROPIC_API_KEY) {
        return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
      }
      // No key configured — degrade gracefully to the deterministic engine.
      return new HeuristicProvider();
    case "openai":
      // OpenAI provider lands in a later iteration; heuristic keeps the app working.
      return new HeuristicProvider();
    default:
      return new HeuristicProvider();
  }
}
