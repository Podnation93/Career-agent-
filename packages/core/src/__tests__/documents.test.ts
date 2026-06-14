import { describe, expect, it } from "vitest";
import { generateDocumentHeuristic, type DocGenInput } from "../ai/documents.js";

const base: Omit<DocGenInput, "kind"> = {
  profile: {
    headline: "Dylan — IT Support Analyst",
    summary: "IT support with SQL and ERP experience.",
    skills: ["IT Support", "SQL", "Ticketing"],
    careerGoals: "Move into SOC.",
  },
  job: { title: "Junior SOC Analyst", company: "SecureView", description: "Splunk required." },
  context: {
    matchedSkills: ["IT Support", "SQL"],
    missingSkills: ["SIEM"],
    resumeStrategy: "Emphasise incident triage.",
    coverLetterAngle: "Position L2 support as SOC preparation.",
    interviewPoints: ["Walk through an incident."],
  },
};

describe("generateDocumentHeuristic", () => {
  it("never claims a missing skill and surfaces it in doNotClaim", () => {
    for (const kind of ["resume_notes", "cover_letter", "screening_answers", "interview_prep"] as const) {
      const doc = generateDocumentHeuristic({ ...base, kind });
      expect(doc.doNotClaim).toContain("SIEM");
      expect(doc.bodyMarkdown.toLowerCase()).not.toMatch(/i (have|am) .{0,20}\bsiem\b/);
      expect(doc.title).toContain("Junior SOC Analyst");
      expect(doc.bodyMarkdown.length).toBeGreaterThan(20);
    }
  });

  it("includes matched skills as keywords", () => {
    const doc = generateDocumentHeuristic({ ...base, kind: "resume_notes" });
    expect(doc.keywordsToInclude).toContain("SQL");
  });

  it("answers provided screening questions", () => {
    const doc = generateDocumentHeuristic({
      ...base,
      kind: "screening_answers",
      screeningQuestions: ["Why do you want this role?"],
    });
    expect(doc.bodyMarkdown).toContain("Why do you want this role?");
  });
});
