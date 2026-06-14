import { canonicalizeUrl, dedupeHash, getProvider } from "@jobpilot/core";
import { schema } from "@jobpilot/db";
import { manualImportSchema } from "@jobpilot/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../lib/env.js";
import { badRequest } from "../lib/errors.js";
import { toJobDTO } from "../lib/mappers.js";
import { scoreJobForUser } from "../services/scoring.js";

/** Decode an uploaded file (txt or simple PDF) into text. */
function decodeFile(base64: string, filename?: string): string {
  const buf = Buffer.from(base64, "base64");
  // For text files, decode directly. PDF parsing is added in Phase 3; for now we
  // extract any embedded ASCII text as a best effort and warn via the parser.
  if (filename?.toLowerCase().endsWith(".pdf")) {
    return buf.toString("latin1").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ");
  }
  return buf.toString("utf8");
}

export default async function importRoutes(app: FastifyInstance) {
  app.post("/manual", async (req, reply) => {
    const user = app.requireUser(req);
    const input = manualImportSchema.parse(req.body);
    const env = loadEnv();
    const provider = getProvider(env);

    let text = "";
    let sourceUrl: string | undefined;
    let source: "manual_url" | "manual_text" | "manual_file";

    if (input.kind === "url") {
      sourceUrl = canonicalizeUrl(input.url!);
      // We do NOT fetch/scrape the URL. The user pastes text, or the URL is stored
      // as the apply target. Title defaults from the URL slug until enriched.
      text = input.text ?? sourceUrl;
      source = "manual_url";
    } else if (input.kind === "text") {
      text = input.text!;
      source = "manual_text";
    } else {
      text = decodeFile(input.fileBase64!, input.filename);
      source = "manual_file";
      if (!text.trim()) throw badRequest("Could not read any text from the uploaded file.");
    }

    const extracted = await provider.extractJob(text, sourceUrl);
    const hashKey = dedupeHash({
      title: extracted.title,
      company: extracted.company,
      location: extracted.location,
      url: sourceUrl,
    });

    // Dedupe within the user's jobs.
    const [dup] = await app.db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, user.id), eq(schema.jobs.dedupeHash, hashKey)));
    if (dup) {
      return { job: toJobDTO(dup), duplicateOf: dup.id };
    }

    const [job] = await app.db
      .insert(schema.jobs)
      .values({
        userId: user.id,
        title: extracted.title,
        company: extracted.company ?? null,
        location: extracted.location ?? null,
        workType: extracted.workType,
        salaryMin: extracted.salaryMin ?? null,
        salaryMax: extracted.salaryMax ?? null,
        salaryText: extracted.salaryText ?? null,
        source,
        sourceUrl: sourceUrl ?? extracted.sourceUrl ?? null,
        applyUrl: sourceUrl ?? extracted.applyUrl ?? null,
        dedupeHash: hashKey,
      })
      .returning();

    await app.db.insert(schema.jobDescriptions).values({
      jobId: job!.id,
      rawImportText: text,
      cleanText: text,
    });
    await app.db.insert(schema.applicationEvents).values({
      jobId: job!.id,
      userId: user.id,
      type: "imported",
      payload: { source, confidence: extracted.confidence, warnings: extracted.warnings },
    });

    // Score synchronously (Phase 1). Phase 4 enqueues this on the worker.
    await scoreJobForUser(app.db, user.id, job!.id);
    const [scored] = await app.db.select().from(schema.jobs).where(eq(schema.jobs.id, job!.id));

    return reply.status(201).send({ job: toJobDTO(scored!), warnings: extracted.warnings });
  });

  app.get("/status", async (req) => {
    const user = app.requireUser(req);
    const recent = await app.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.userId, user.id))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(10);
    return { queued: 0, running: 0, recentImports: recent.map(toJobDTO) };
  });
}
