/**
 * Document generation types + deterministic generator (P3/P4/P5 + interview prep).
 * The deterministic version builds truthful drafts from the scoring context; the
 * Anthropic provider overrides with AI output behind the same contract and falls
 * back here on failure. Nothing here invents experience — `doNotClaim` always
 * carries the job-required skills the profile lacks.
 */
import type { DocumentKind, GeneratedDoc } from "@jobpilot/shared";

export interface DocProfile {
  headline?: string | null;
  summary?: string | null;
  skills: string[];
  experience?: { title: string; company?: string; bullets?: string[] }[];
  careerGoals?: string | null;
}

export interface DocJob {
  title: string;
  company?: string | null;
  description?: string | null;
  location?: string | null;
}

export interface DocContext {
  matchedSkills: string[];
  missingSkills: string[];
  resumeStrategy?: string;
  coverLetterAngle?: string;
  interviewPoints?: string[];
}

export interface DocGenInput {
  kind: DocumentKind;
  profile: DocProfile;
  job: DocJob;
  context: DocContext;
  tone?: string;
  screeningQuestions?: string[];
}

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  resume_notes: "Resume notes",
  cover_letter: "Cover letter",
  screening_answers: "Screening answers",
  interview_prep: "Interview prep",
};

/** Deterministic, dependency-free document generator. */
export function generateDocumentHeuristic(input: DocGenInput): GeneratedDoc {
  const { kind, profile, job, context } = input;
  const company = job.company ?? "the company";
  const matched = context.matchedSkills;
  const missing = context.missingSkills;
  const name = (profile.headline ?? "").split("&")[0]?.trim() || "the candidate";
  const doNotClaimNote = missing.length
    ? `\n\n> ⚠️ Do not claim: ${missing.join(", ")} (not in your profile). Mention your cybersecurity study and transferable experience instead.`
    : "";

  let title: string;
  let body: string;

  switch (kind) {
    case "resume_notes":
      title = `Resume notes — ${job.title}`;
      body =
        `## Tailoring notes for ${job.title} at ${company}\n\n` +
        `**Emphasise:** ${matched.join(", ") || "your closest transferable experience"}.\n\n` +
        `**Suggested summary:** ${context.resumeStrategy ?? "Lead with your IT support and SQL investigation experience."}` +
        doNotClaimNote;
      break;
    case "cover_letter":
      title = `Cover letter — ${job.title}`;
      body =
        `Dear Hiring Manager,\n\n` +
        `I'm writing to apply for the ${job.title} role at ${company}. ` +
        `${context.coverLetterAngle ?? "My IT support background has prepared me well for this position."} ` +
        `In my current role I handle L1/L2 tickets, investigate data issues with SQL, and support business applications end to end.\n\n` +
        `I would welcome the chance to discuss how my experience fits your team.\n\nKind regards,\n${name}` +
        doNotClaimNote;
      break;
    case "screening_answers":
      title = `Screening answers — ${job.title}`;
      body =
        `### Likely screening questions\n\n` +
        (input.screeningQuestions && input.screeningQuestions.length
          ? input.screeningQuestions.map((q) => `**${q}**\nAnswer from your real experience: ${matched.join(", ") || "your support background"}.`).join("\n\n")
          : `**Why this role?** ${context.coverLetterAngle ?? "It aligns with my support experience and security goals."}\n\n` +
            `**Relevant skills:** ${matched.join(", ") || "IT support, ticketing, SQL"}.`) +
        (missing.length ? `\n\n**Gaps to address honestly:** ${missing.join(", ")}.` : "") +
        doNotClaimNote;
      break;
    case "interview_prep":
      title = `Interview prep — ${job.title}`;
      body =
        `### Talking points\n\n` +
        (context.interviewPoints && context.interviewPoints.length
          ? context.interviewPoints
          : ["Walk through a real incident you triaged end to end."]
        )
          .map((p) => `- ${p}`)
          .join("\n") +
        doNotClaimNote;
      break;
  }

  return {
    title,
    bodyMarkdown: body,
    keywordsToInclude: matched,
    doNotClaim: missing,
    flaggedGaps: missing,
    confidence: context.resumeStrategy ? 0.6 : 0.4,
    warnings: missing.length ? [] : ["No skills gap detected — verify the job ad was fully captured."],
  };
}
