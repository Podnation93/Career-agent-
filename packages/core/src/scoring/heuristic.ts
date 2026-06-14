/**
 * Deterministic scoring engine. Mirrors the rubric in docs/PROMPTS.md (P2) so the
 * app produces explainable scores with no AI dependency. The AI provider can
 * override this later, but always falls back here on failure.
 */
import type { Recommendation, ScoreResult, ScoringWeights, WorkType } from "@jobpilot/shared";
import { locationScore, type LocationPrefs } from "../location/melbourne.js";
import { extractSkills, matchSkills } from "../skills/taxonomy.js";

export interface ScoreProfile {
  skills: string[];
  targetRoles: string[];
  acceptRemote: boolean;
  acceptHybrid: boolean;
  acceptCbd: boolean;
  targetLocations?: string[];
  salaryGoalMin?: number | null;
  salaryGoalMax?: number | null;
}

export interface ScoreJob {
  title: string;
  description?: string | null;
  location?: string | null;
  workType: WorkType;
  salaryMin?: number | null;
  salaryMax?: number | null;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  role: 0.2,
  skills: 0.3,
  location: 0.2,
  experience: 0.15,
  salary: 0.1,
  effort: 0.05,
};

/** Words that imply seniority the user is not targeting (entry/junior focus). */
const SENIOR_TERMS = ["senior", "lead", "principal", "manager", "head of", "architect"];
const YEARS_RE = /(\d{1,2})\+?\s*(?:years|yrs)/gi;

function roleFit(title: string, targetRoles: string[]): { score: number; reason: string } {
  const t = title.toLowerCase();
  const hit = targetRoles.find((r) => t.includes(r.toLowerCase()) || overlapsRole(t, r));
  let score = hit ? 90 : 45;
  let reason = hit ? `Title matches target role "${hit}".` : "Title only loosely matches target roles.";
  if (SENIOR_TERMS.some((s) => t.includes(s))) {
    score = Math.max(15, score - 45);
    reason += " Looks too senior for current targets.";
  }
  return { score, reason };
}

function overlapsRole(title: string, role: string): boolean {
  const roleWords = role.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return roleWords.length > 0 && roleWords.every((w) => title.includes(w));
}

function experienceFit(text: string): { score: number; reason: string } {
  let maxYears = 0;
  for (const m of text.matchAll(YEARS_RE)) {
    maxYears = Math.max(maxYears, Number(m[1]));
  }
  if (maxYears === 0) return { score: 70, reason: "No explicit experience requirement found." };
  if (maxYears <= 2) return { score: 95, reason: `Asks for ${maxYears} years — great for entry level.` };
  if (maxYears <= 4) return { score: 70, reason: `Asks for ${maxYears} years — reachable.` };
  if (maxYears <= 6) return { score: 40, reason: `Asks for ${maxYears} years — a stretch.` };
  return { score: 15, reason: `Asks for ${maxYears}+ years — likely too senior.` };
}

function salaryFit(
  job: ScoreJob,
  profile: ScoreProfile,
): { score: number; reason: string } {
  const goalMin = profile.salaryGoalMin ?? undefined;
  const jobMax = job.salaryMax ?? job.salaryMin ?? undefined;
  if (goalMin == null || jobMax == null) {
    return { score: 60, reason: "Salary fit unknown (missing data)." };
  }
  if (jobMax >= goalMin) {
    const stepUp = jobMax >= goalMin * 1.05;
    return {
      score: stepUp ? 90 : 75,
      reason: stepUp ? "Salary meets or exceeds your goal (a step up)." : "Salary meets your goal.",
    };
  }
  return { score: 35, reason: "Salary below your goal." };
}

function effortFit(text: string): { score: number; reason: string } {
  const t = text.toLowerCase();
  if (t.includes("easy apply") || t.includes("quick apply")) {
    return { score: 90, reason: "Easy/quick apply — low effort." };
  }
  if (t.includes("address the selection criteria") || t.includes("selection criteria")) {
    return { score: 35, reason: "Selection criteria required — higher effort." };
  }
  return { score: 65, reason: "Standard application effort." };
}

function recommend(score: number): Recommendation {
  if (score >= 72) return "apply";
  if (score >= 50) return "consider";
  return "skip";
}

/** Score a job against a profile. Pure and deterministic. */
export function scoreJob(
  profile: ScoreProfile,
  job: ScoreJob,
  weightsOverride?: Partial<ScoringWeights>,
): ScoreResult {
  const weights = { ...DEFAULT_WEIGHTS, ...weightsOverride };
  const text = `${job.title}\n${job.description ?? ""}`;
  const warnings: string[] = [];
  if (!job.description) warnings.push("No job description — scores are based on the title only.");

  const jobSkills = extractSkills(text);
  const { matched, missing } = matchSkills(profile.skills, jobSkills);
  const skillsScore =
    jobSkills.length === 0 ? 50 : Math.round((matched.length / jobSkills.length) * 100);

  const role = roleFit(job.title, profile.targetRoles);
  const loc = locationScore(job.location, job.workType, profile as LocationPrefs);
  const exp = experienceFit(text);
  const sal = salaryFit(job, profile);
  const eff = effortFit(text);

  const categoryScores = {
    role: role.score,
    skills: skillsScore,
    location: loc.score,
    experience: exp.score,
    salary: sal.score,
    effort: eff.score,
  };

  const totalWeight =
    weights.role + weights.skills + weights.location + weights.experience + weights.salary + weights.effort;
  const weighted =
    role.score * weights.role +
    skillsScore * weights.skills +
    loc.score * weights.location +
    exp.score * weights.experience +
    sal.score * weights.salary +
    eff.score * weights.effort;
  const score = Math.round(weighted / (totalWeight || 1));

  const recommendation = recommend(score);

  // Transferable skills: things the profile has that relate but weren't required.
  const transferableSkills = profile.skills
    .map((s) => s)
    .filter((s) => !matched.includes(s))
    .slice(0, 5);

  const risks: string[] = [];
  if (missing.length > 0) risks.push(`Missing required skills: ${missing.join(", ")}.`);
  if (role.score < 50) risks.push("Role may not align with your target titles.");
  if (exp.score < 40) risks.push("Experience requirement may exceed your current level.");

  const reason =
    `${role.reason} ${loc.reason} ` +
    (jobSkills.length
      ? `Matched ${matched.length}/${jobSkills.length} detected skills.`
      : "No specific skills detected in the ad.");

  return {
    score,
    recommendation,
    reason: reason.trim(),
    categoryScores,
    matchedSkills: matched,
    missingSkills: missing,
    transferableSkills,
    risks,
    resumeStrategy:
      matched.length > 0
        ? `Emphasise ${matched.slice(0, 4).join(", ")}. Do not claim any skill you don't have (${missing.join(", ") || "none missing"}).`
        : "Highlight your closest transferable experience; do not invent skills.",
    coverLetterAngle:
      role.score >= 70
        ? `Position your current support experience as strong preparation for "${job.title}".`
        : "Frame transferable strengths honestly; acknowledge the gap and your learning path.",
    interviewPoints: [
      "Walk through a real incident you triaged end to end.",
      matched.length ? `Demonstrate depth in ${matched[0]}.` : "Show eagerness to learn the required tools.",
      "Connect your cybersecurity study to the role's goals.",
    ],
    confidence: job.description ? 0.7 : 0.4,
    warnings,
  };
}
