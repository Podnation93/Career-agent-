import { describe, expect, it } from "vitest";
import { scoreJob, type ScoreProfile } from "../scoring/heuristic.js";
import { locationScore } from "../location/melbourne.js";
import { matchSkills, extractSkills } from "../skills/taxonomy.js";
import { canonicalizeUrl } from "../parsing/jobText.js";
import { dedupeHash, isDuplicate } from "../dedupe/dedupe.js";

const profile: ScoreProfile = {
  skills: ["IT Support", "Ticketing", "SQL", "ERP Support", "Customer Support"],
  targetRoles: ["IT Support Analyst", "Junior SOC Analyst", "Application Support Analyst"],
  acceptRemote: true,
  acceptHybrid: true,
  acceptCbd: true,
  salaryGoalMin: 70000,
  salaryGoalMax: 95000,
};

describe("location scoring", () => {
  it("ranks priority suburbs highest", () => {
    expect(locationScore("Footscray, VIC", "onsite", profile).tier).toBe("excellent");
  });
  it("ranks good suburbs in the middle", () => {
    expect(locationScore("Newport", "onsite", profile).tier).toBe("good");
  });
  it("ranks distant onsite suburbs poorly", () => {
    expect(locationScore("Geelong", "onsite", profile).tier).toBe("poor");
  });
  it("accepts remote regardless of suburb", () => {
    expect(locationScore("Anywhere", "remote", profile).score).toBeGreaterThan(90);
  });
});

describe("skill matching", () => {
  it("extracts canonical skills via aliases", () => {
    const skills = extractSkills("Experience with T-SQL queries and a service desk / helpdesk role");
    expect(skills).toContain("SQL");
    expect(skills).toContain("Service Desk");
  });
  it("computes matched vs missing", () => {
    const { matched, missing } = matchSkills(profile.skills, ["SQL", "Splunk"]);
    expect(matched).toContain("SQL");
    expect(missing).toContain("SIEM"); // Splunk canonicalises to SIEM
  });
});

describe("scoreJob", () => {
  it("scores a strong support match in the apply band", () => {
    const res = scoreJob(profile, {
      title: "IT Support Analyst",
      description: "L1/L2 ticketing, ERP support, SQL investigation, customer support. Footscray hybrid.",
      location: "Footscray, VIC",
      workType: "hybrid",
      salaryMin: 75000,
      salaryMax: 85000,
    });
    expect(res.score).toBeGreaterThanOrEqual(72);
    expect(res.recommendation).toBe("apply");
  });

  it("penalises an over-senior, distant role", () => {
    const res = scoreJob(profile, {
      title: "Senior Network Engineer",
      description: "8+ years required, CCNP, design large networks.",
      location: "Geelong, VIC",
      workType: "onsite",
      salaryMin: 120000,
      salaryMax: 140000,
    });
    expect(res.score).toBeLessThan(60);
  });

  it("never invents skills the profile lacks", () => {
    const res = scoreJob(profile, {
      title: "SOC Analyst",
      description: "Splunk and Microsoft Sentinel required.",
      location: "Melbourne CBD",
      workType: "hybrid",
    });
    expect(res.matchedSkills).not.toContain("SIEM");
    expect(res.missingSkills).toContain("SIEM");
  });
});

describe("url canonicalisation + dedupe", () => {
  it("strips tracking params", () => {
    expect(canonicalizeUrl("https://x.com/job/1?utm_source=seek&id=5")).toBe("https://x.com/job/1?id=5");
  });
  it("detects the same listing via url", () => {
    const a = { title: "IT Support", url: "https://x.com/job/1?utm_source=seek" };
    const b = { title: "IT Support (closed)", url: "https://x.com/job/1" };
    expect(dedupeHash(a)).toBe(dedupeHash(b));
    expect(isDuplicate(a, b)).toBe(true);
  });
  it("does not merge different roles at the same company", () => {
    const a = { title: "IT Support", company: "Acme" };
    const b = { title: "Network Engineer", company: "Acme" };
    expect(isDuplicate(a, b)).toBe(false);
  });
});
