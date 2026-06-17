import {
  canonicalizeUrl,
  dedupeHash,
  getProvider,
  searchSeek,
  fetchSeekDescription,
  searchAdzuna,
} from "@jobpilot/core";
import { schema } from "@jobpilot/db";
import { manualImportSchema, type JobSource, type WorkType } from "@jobpilot/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../lib/env.js";
import { badRequest } from "../lib/errors.js";
import { toJobDTO } from "../lib/mappers.js";
import { scoreJobForUser } from "../services/scoring.js";

/** Decode an uploaded file (txt or simple PDF) into text. */
function decodeFile(base64: string, filename?: string): string {
  const buf = Buffer.from(base64, "base64");
  if (filename?.toLowerCase().endsWith(".pdf")) {
    return buf.toString("latin1").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ");
  }
  return buf.toString("utf8");
}

interface PersistInput {
  title: string;
  company?: string | null;
  location?: string | null;
  workType: WorkType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryText?: string | null;
  source: JobSource;
  sourceUrl?: string | null;
  applyUrl?: string | null;
  descriptionText: string;
  confidence?: number;
  warnings?: string[];
}

/** Dedupe, insert a job + its description, log the event, score it. Shared by all importers. */
async function persistJob(app: FastifyInstance, userId: string, input: PersistInput) {
  const hashKey = dedupeHash({
    title: input.title,
    company: input.company ?? undefined,
    location: input.location ?? undefined,
    url: input.sourceUrl ?? undefined,
  });

  const [dup] = await app.db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.dedupeHash, hashKey)));
  if (dup) return { job: toJobDTO(dup), duplicateOf: dup.id, created: false as const };

  const [job] = await app.db
    .insert(schema.jobs)
    .values({
      userId,
      title: input.title,
      company: input.company ?? null,
      location: input.location ?? null,
      workType: input.workType,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryText: input.salaryText ?? null,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      applyUrl: input.applyUrl ?? input.sourceUrl ?? null,
      dedupeHash: hashKey,
    })
    .returning();

  await app.db.insert(schema.jobDescriptions).values({
    jobId: job!.id,
    rawImportText: input.descriptionText,
    cleanText: input.descriptionText,
  });
  await app.db.insert(schema.applicationEvents).values({
    jobId: job!.id,
    userId,
    type: "imported",
    payload: { source: input.source, confidence: input.confidence ?? null, warnings: input.warnings ?? [] },
  });

  await scoreJobForUser(app.db, userId, job!.id);
  const [scored] = await app.db.select().from(schema.jobs).where(eq(schema.jobs.id, job!.id));
  return { job: toJobDTO(scored!), created: true as const };
}

/** Run `fn` over `items` with at most `n` in flight. */
async function mapPool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]!);
    }),
  );
  return out;
}

export default async function importRoutes(app: FastifyInstance) {
  app.post("/manual", async (req, reply) => {
    const user = app.requireUser(req);
    const input = manualImportSchema.parse(req.body);
    const provider = getProvider(loadEnv());

    let text = "";
    let sourceUrl: string | undefined;
    let source: JobSource;

    if (input.kind === "url") {
      sourceUrl = canonicalizeUrl(input.url!);
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
    const result = await persistJob(app, user.id, {
      title: extracted.title,
      company: extracted.company,
      location: extracted.location,
      workType: extracted.workType,
      salaryMin: extracted.salaryMin,
      salaryMax: extracted.salaryMax,
      salaryText: extracted.salaryText,
      source,
      sourceUrl,
      applyUrl: sourceUrl ?? extracted.applyUrl,
      descriptionText: text,
      confidence: extracted.confidence,
      warnings: extracted.warnings,
    });
    return reply.status(result.created ? 201 : 200).send({
      job: result.job,
      duplicateOf: result.duplicateOf,
      warnings: extracted.warnings,
    });
  });

  // Search Seek and import matching jobs (with full descriptions for good tailoring).
  app.post("/seek", async (req, reply) => {
    const user = app.requireUser(req);
    const body = (req.body ?? {}) as { keywords?: string; location?: string; pages?: number };
    const keywords = (body.keywords ?? "").trim();
    if (!keywords) throw badRequest("keywords is required.");
    const location = (body.location ?? "All Melbourne VIC").trim();
    const pages = Math.max(1, Math.min(body.pages ?? 1, 3));

    let listings;
    try {
      listings = await searchSeek({ keywords, location, pages });
    } catch (err) {
      throw badRequest(`Seek search failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }

    // Fetch full ad bodies (bounded concurrency, capped) so tailoring has real text.
    const detailCap = 25;
    const descriptions = await mapPool(listings.slice(0, detailCap), 5, (j) => fetchSeekDescription(j.externalId));

    const jobs = [];
    let imported = 0;
    let duplicates = 0;
    for (let i = 0; i < listings.length; i++) {
      const j = listings[i]!;
      const full = descriptions[i] || "";
      const descriptionText = [j.title, j.company, j.location, full || j.description].filter(Boolean).join("\n");
      const result = await persistJob(app, user.id, {
        title: j.title,
        company: j.company,
        location: j.location,
        workType: j.workType,
        salaryText: j.salaryText,
        source: "seek",
        sourceUrl: j.url,
        applyUrl: j.url,
        descriptionText,
        confidence: 1,
        warnings: [],
      });
      if (result.created) imported++;
      else duplicates++;
      jobs.push(result.job);
    }

    return reply.status(201).send({ found: listings.length, imported, duplicates, jobs });
  });

  // Search Adzuna (official API) and import matching jobs. Needs ADZUNA_APP_ID/KEY.
  app.post("/adzuna", async (req, reply) => {
    const user = app.requireUser(req);
    const env = loadEnv();
    const body = (req.body ?? {}) as { keywords?: string; location?: string; pages?: number };
    const keywords = (body.keywords ?? "").trim();
    if (!keywords) throw badRequest("keywords is required.");
    const location = (body.location ?? "Melbourne VIC").trim();
    const pages = Math.max(1, Math.min(body.pages ?? 1, 3));

    let listings;
    try {
      listings = await searchAdzuna(
        { appId: env.ADZUNA_APP_ID ?? "", appKey: env.ADZUNA_APP_KEY ?? "" },
        { keywords, location, pages },
      );
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Adzuna search failed");
    }

    const jobs = [];
    let imported = 0;
    let duplicates = 0;
    for (const j of listings) {
      const descriptionText = [j.title, j.company, j.location, j.description].filter(Boolean).join("\n");
      const result = await persistJob(app, user.id, {
        title: j.title,
        company: j.company,
        location: j.location,
        workType: j.workType,
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        salaryText: j.salaryText,
        source: "adzuna",
        sourceUrl: j.url,
        applyUrl: j.url,
        descriptionText,
        confidence: 1,
        warnings: [],
      });
      if (result.created) imported++;
      else duplicates++;
      jobs.push(result.job);
    }
    return reply.status(201).send({ found: listings.length, imported, duplicates, jobs });
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
