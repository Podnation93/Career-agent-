/**
 * Seeds a default user, Dylan's profile, and a handful of sample jobs so the
 * app is usable immediately after `pnpm db:push`.
 *
 *   Default login:  demo@jobpilot.local  /  jobpilot123
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { scoreJob, type ScoreProfile } from "@jobpilot/core";
import { eq } from "drizzle-orm";
import { createDb, closeDb } from "./client.js";
import { jobDescriptions, jobScores, jobs, profiles, resumes, users } from "./schema.js";

const SCORE_PROFILE: ScoreProfile = {
  skills: [
    "IT Support",
    "Service Desk",
    "Ticketing",
    "ERP Support",
    "SQL",
    "Customer Support",
    "Automation",
    "Windows",
    "Active Directory",
  ],
  targetRoles: [
    "IT Support Analyst",
    "Service Desk Analyst",
    "Application Support Analyst",
    "ERP Support Analyst",
    "SQL Support Analyst",
    "Junior SOC Analyst",
    "Cybersecurity Analyst",
    "Technical Support Analyst",
    "Helpdesk Analyst",
    "Support Engineer",
  ],
  acceptRemote: true,
  acceptHybrid: true,
  acceptCbd: true,
  salaryGoalMin: 70000,
  salaryGoalMax: 95000,
};

const DEMO_EMAIL = "demo@jobpilot.local";
const DEMO_PASSWORD = "jobpilot123";

function dedupeHash(title: string, company: string, location: string, url: string): string {
  return [title, company, location, url]
    .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

async function main() {
  const db = createDb();

  // ── user ────────────────────────────────────────────────────
  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  let userId = existing[0]?.id;
  if (!userId) {
    const passwordHash = await hash(DEMO_PASSWORD);
    const [u] = await db
      .insert(users)
      .values({ email: DEMO_EMAIL, passwordHash, displayName: "Dylan" })
      .returning();
    userId = u!.id;
    console.log(`Created user ${DEMO_EMAIL}`);
  } else {
    console.log(`User ${DEMO_EMAIL} already exists; reusing.`);
  }

  // ── profile ─────────────────────────────────────────────────
  const profExists = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (profExists.length === 0) {
    await db.insert(profiles).values({
      userId,
      headline: "IT Support Analyst & Cybersecurity Student",
      summary:
        "IT Support Analyst in Melbourne with hands-on experience in ticketing, ERP support, " +
        "SQL investigation, automation, and customer-facing technical support. Studying cybersecurity " +
        "with a goal of moving into SOC / security operations.",
      skills: [
        { name: "IT Support", level: "advanced", years: 3 },
        { name: "Service Desk", level: "advanced", years: 3 },
        { name: "Ticketing", level: "advanced", years: 3 },
        { name: "ERP Support", level: "intermediate", years: 2 },
        { name: "SQL", level: "intermediate", years: 2 },
        { name: "Customer Support", level: "advanced", years: 4 },
        { name: "Automation", level: "intermediate", years: 1 },
        { name: "Windows", level: "advanced", years: 3 },
        { name: "Active Directory", level: "intermediate", years: 2 },
        { name: "Networking", level: "beginner", years: 1 },
      ],
      experience: [
        {
          title: "IT Support Analyst",
          company: "Current Employer",
          start: "2022",
          end: "Present",
          bullets: [
            "Triage and resolve L1/L2 tickets across hardware, software, and access.",
            "Investigate data issues with SQL queries against the ERP database.",
            "Document fixes and build runbooks to reduce repeat incidents.",
          ],
        },
      ],
      targetRoles: [
        "IT Support Analyst",
        "Service Desk Analyst",
        "Application Support Analyst",
        "ERP Support Analyst",
        "SQL Support Analyst",
        "Junior SOC Analyst",
        "Cybersecurity Analyst",
        "Technical Support Analyst",
        "Helpdesk Analyst",
        "Support Engineer",
      ],
      targetLocations: [
        "Western Melbourne",
        "Melbourne CBD",
        "Richmond",
        "Docklands",
        "Southbank",
        "North Melbourne",
        "Footscray",
        "Sunshine",
        "Werribee",
        "Laverton",
      ],
      salaryGoalMin: 70000,
      salaryGoalMax: 95000,
      careerGoals:
        "Move from IT support into security operations (SOC analyst), leveraging incident triage, " +
        "SQL investigation, and cybersecurity study.",
    });

    await db.insert(resumes).values({
      userId,
      label: "Base resume",
      isBase: true,
      content:
        "Dylan — IT Support Analyst & Cybersecurity Student\n\n" +
        "Summary: IT support professional experienced in ticketing, ERP and SQL support...",
    });
    console.log("Created profile + base resume.");
  } else {
    console.log("Profile already exists; skipping.");
  }

  // ── sample jobs ─────────────────────────────────────────────
  const samples = [
    {
      title: "IT Support Analyst",
      company: "Westgate Logistics",
      location: "Footscray, VIC",
      workType: "hybrid" as const,
      salaryMin: 75000,
      salaryMax: 85000,
      salaryText: "$75,000 – $85,000 + super",
      sourceUrl: "https://example.com/jobs/it-support-analyst-footscray",
      description:
        "We need an IT Support Analyst to handle L1/L2 tickets, support our ERP system, run SQL " +
        "queries for data issues, and deliver great customer service. Windows, Active Directory, ticketing.",
    },
    {
      title: "Junior SOC Analyst",
      company: "SecureView",
      location: "Melbourne CBD, VIC",
      workType: "hybrid" as const,
      salaryMin: 80000,
      salaryMax: 95000,
      salaryText: "$80k–$95k",
      sourceUrl: "https://example.com/jobs/junior-soc-analyst-cbd",
      description:
        "Entry-level SOC role. Triage security alerts, investigate incidents, document findings. " +
        "Exposure to Microsoft Sentinel or Splunk desirable. Great for someone studying cybersecurity.",
    },
    {
      title: "Application Support Analyst",
      company: "Riverbank Health",
      location: "Richmond, VIC",
      workType: "onsite" as const,
      salaryMin: 78000,
      salaryMax: 88000,
      salaryText: "$78,000 – $88,000",
      sourceUrl: "https://example.com/jobs/application-support-richmond",
      description:
        "Support business applications, investigate issues with SQL, liaise with users, manage tickets " +
        "and escalations. Strong customer support and documentation skills required.",
    },
    {
      title: "Senior Network Engineer",
      company: "CoreNet",
      location: "Geelong, VIC",
      workType: "onsite" as const,
      salaryMin: 120000,
      salaryMax: 140000,
      salaryText: "$120k–$140k",
      sourceUrl: "https://example.com/jobs/senior-network-engineer-geelong",
      description:
        "8+ years network engineering, CCNP required, design and run large-scale networks. " +
        "Deep BGP/OSPF, firewalls, data centre experience.",
    },
  ];

  for (const s of samples) {
    const hashKey = dedupeHash(s.title, s.company, s.location, s.sourceUrl);
    const dup = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.dedupeHash, hashKey));
    if (dup.length > 0) continue;
    const [job] = await db
      .insert(jobs)
      .values({
        userId,
        title: s.title,
        company: s.company,
        location: s.location,
        workType: s.workType,
        salaryMin: s.salaryMin,
        salaryMax: s.salaryMax,
        salaryText: s.salaryText,
        source: "manual_text",
        sourceUrl: s.sourceUrl,
        applyUrl: s.sourceUrl,
        status: "new",
        dedupeHash: hashKey,
      })
      .returning();
    await db.insert(jobDescriptions).values({
      jobId: job!.id,
      rawImportText: s.description,
      cleanText: s.description,
    });

    // Pre-score with the deterministic engine so the dashboard is populated.
    const result = scoreJob(SCORE_PROFILE, {
      title: s.title,
      description: s.description,
      location: s.location,
      workType: s.workType,
      salaryMin: s.salaryMin,
      salaryMax: s.salaryMax,
    });
    await db.insert(jobScores).values({
      jobId: job!.id,
      provider: "heuristic",
      score: result.score,
      recommendation: result.recommendation,
      reason: result.reason,
      categoryScores: result.categoryScores,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      risks: result.risks,
      resumeStrategy: result.resumeStrategy,
      coverLetterAngle: result.coverLetterAngle,
      interviewPoints: result.interviewPoints,
      confidence: String(result.confidence),
      warnings: result.warnings,
      rawResponse: result as unknown as Record<string, unknown>,
    });
    await db
      .update(jobs)
      .set({ matchScore: result.score, recommendation: result.recommendation })
      .where(eq(jobs.id, job!.id));
  }
  console.log(`Seeded ${samples.length} sample jobs (skipping duplicates).`);

  await closeDb();
  console.log("\nSeed complete. Login with demo@jobpilot.local / jobpilot123");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
