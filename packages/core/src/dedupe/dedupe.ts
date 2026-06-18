/**
 * Multi-signal duplicate detection: canonical URL, normalised title+company+
 * location, and a lightweight text-shingle similarity. The DB enforces the
 * `dedupeHash` uniqueness; `isDuplicate` is used for cross-checks and the
 * "seen again" path.
 */
import { canonicalizeUrl } from "../parsing/jobText.js";

export interface DedupeInput {
  title: string;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  description?: string | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Stable dedupe key. Prefers the canonical URL when present (most reliable),
 * otherwise falls back to title+company+location.
 */
export function dedupeHash(job: DedupeInput): string {
  if (job.url) {
    return `url:${canonicalizeUrl(job.url).toLowerCase()}`;
  }
  return `tcl:${norm(job.title)}|${norm(job.company)}|${norm(job.location)}`;
}

function shingles(text: string, k = 3): Set<string> {
  const words = norm(text).split(" ").filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + k <= words.length; i++) {
    set.add(words.slice(i, i + k).join(" "));
  }
  return set;
}

/** Jaccard similarity over word shingles (0–1). */
export function textSimilarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** True if two jobs are very likely the same listing. */
export function isDuplicate(a: DedupeInput, b: DedupeInput, threshold = 0.6): boolean {
  if (a.url && b.url && canonicalizeUrl(a.url) === canonicalizeUrl(b.url)) return true;
  if (dedupeHash(a) === dedupeHash(b)) return true;
  const sameTitleCo =
    norm(a.title) === norm(b.title) && norm(a.company) === norm(b.company) && norm(a.company) !== "";
  if (sameTitleCo) return true;
  if (a.description && b.description) {
    return textSimilarity(a.description, b.description) >= threshold;
  }
  return false;
}
