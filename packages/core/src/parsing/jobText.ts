/**
 * Deterministic extraction of structured job fields from pasted text or HTML.
 * This is the heuristic fallback; the AI extractor (P1) can replace it when a
 * provider is configured. Never fabricates data — unknown fields stay null.
 */
import type { ExtractedJob, WorkType } from "@jobpilot/shared";
import { extractSkills } from "../skills/taxonomy.js";

const SALARY_RE =
  /\$\s?(\d{2,3})(?:[,.]?(\d{3}))?\s?k?\b(?:\s*[-–to]+\s*\$?\s?(\d{2,3})(?:[,.]?(\d{3}))?\s?k?)?/i;

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function detectWorkType(text: string): WorkType {
  const t = text.toLowerCase();
  if (/\bremote\b|work from home|wfh/.test(t)) return "remote";
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bon[- ]?site\b|in office|onsite/.test(t)) return "onsite";
  return "unknown";
}

function parseSalary(text: string): { min?: number; max?: number; raw?: string } {
  const m = SALARY_RE.exec(text);
  if (!m) return {};
  const toNum = (whole?: string, frac?: string): number | undefined => {
    if (!whole) return undefined;
    if (frac) return Number(`${whole}${frac}`);
    // bare "75" or "75k" → 75000
    return Number(whole) * 1000;
  };
  const min = toNum(m[1], m[2]);
  const max = toNum(m[3], m[4]) ?? min;
  return { min, max, raw: m[0].trim() };
}

/**
 * Parse a job from text or HTML. The first non-empty line is treated as the
 * title heuristically; callers should let the user confirm/correct fields.
 */
export function parseJobText(input: string, sourceUrl?: string): ExtractedJob {
  const clean = input.includes("<") && input.includes(">") ? stripHtml(input) : input;
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const warnings: string[] = [];

  const title = lines[0] ?? "Untitled job";
  if (!lines[0]) warnings.push("Could not detect a job title; defaulted to 'Untitled job'.");

  // Look for "Company:" / "at <Company>" / "Location:" patterns.
  let company: string | null = null;
  let location: string | null = null;
  for (const line of lines.slice(0, 12)) {
    const cMatch = /^(?:company|employer)\s*[:\-]\s*(.+)$/i.exec(line);
    if (cMatch && !company) company = cMatch[1]!.trim();
    const lMatch = /^(?:location|based in)\s*[:\-]\s*(.+)$/i.exec(line);
    if (lMatch && !location) location = lMatch[1]!.trim();
    const atMatch = /\bat\s+([A-Z][\w& ]{2,40})/.exec(line);
    if (atMatch && !company) company = atMatch[1]!.trim();
  }
  if (!company) warnings.push("Company not detected — please confirm.");
  if (!location) warnings.push("Location not detected — please confirm.");

  const sal = parseSalary(clean);
  const workType = detectWorkType(clean);
  const requiredSkills = extractSkills(clean);

  return {
    title,
    company,
    location,
    workType,
    salaryMin: sal.min ?? null,
    salaryMax: sal.max ?? null,
    salaryText: sal.raw ?? null,
    applyUrl: sourceUrl ? canonicalizeUrl(sourceUrl) : null,
    sourceUrl: sourceUrl ? canonicalizeUrl(sourceUrl) : null,
    closingDate: null,
    requiredSkills,
    summary: lines.slice(1, 4).join(" ").slice(0, 400),
    confidence: lines.length > 3 ? 0.6 : 0.35,
    warnings,
  };
}

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
];

/** Strip tracking params and normalise a URL for storage and dedupe. */
export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    u.hash = "";
    // normalise trailing slash
    let out = u.toString();
    if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return url.trim();
  }
}
