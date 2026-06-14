/**
 * Job-alert email parsers. Each parser is a pure function from a ParsedEmail to
 * candidate jobs, so they're unit-testable with HTML fixtures. Parsing the
 * user's OWN alert emails (read-only, with consent) is not scraping a job board.
 *
 * Strategy: extract anchor links to listings; per-sender heuristics pick the
 * listing links and nearby title/company/location text; a generic fallback
 * handles unknown senders at lower confidence. The user can correct fields.
 */
import { canonicalizeUrl } from "./jobText.js";
import type { WorkType } from "@jobpilot/shared";

export interface ParsedEmail {
  from: string;
  subject: string;
  date?: string;
  html?: string;
  text?: string;
}

export interface CandidateJob {
  title: string;
  company: string | null;
  location: string | null;
  salaryText: string | null;
  workType: WorkType;
  applyUrl: string | null;
  sourceUrl: string | null;
  snippet: string | null;
  confidence: number;
}

interface Anchor {
  href: string;
  text: string;
}

const NOISE = /unsubscribe|manage|settings|preferences|privacy|help|view (in|online)|update your|notification|view all|see all|app store|google play|terms/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Extract <a href> anchors with their visible text. */
export function extractAnchors(html: string): Anchor[] {
  const anchors: Anchor[] = [];
  const re = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = decodeEntities(m[1]!);
    const text = decodeEntities(m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (href.startsWith("http")) anchors.push({ href, text });
  }
  return anchors;
}

function detectWorkType(text: string): WorkType {
  const t = text.toLowerCase();
  if (/\bremote\b|work from home|wfh/.test(t)) return "remote";
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bon[- ]?site\b|onsite/.test(t)) return "onsite";
  return "unknown";
}

function senderDomain(from: string): string {
  const m = /@([a-z0-9.-]+)/i.exec(from);
  return (m?.[1] ?? "").toLowerCase();
}

function dedupeByUrl(cands: CandidateJob[]): CandidateJob[] {
  const seen = new Set<string>();
  const out: CandidateJob[] = [];
  for (const c of cands) {
    const key = (c.sourceUrl ?? c.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function anchorsToCandidates(
  anchors: Anchor[],
  hrefMatch: RegExp,
  confidence: number,
): CandidateJob[] {
  return anchors
    .filter((a) => hrefMatch.test(a.href) && a.text.length >= 4 && a.text.length <= 120 && !NOISE.test(a.text))
    .map((a) => {
      const url = canonicalizeUrl(a.href);
      return {
        title: a.text,
        company: null,
        location: null,
        salaryText: null,
        workType: detectWorkType(a.text),
        applyUrl: url,
        sourceUrl: url,
        snippet: null,
        confidence,
      } satisfies CandidateJob;
    });
}

/** Dispatch to a per-sender parser, or the generic fallback. */
export function parseJobAlertEmail(email: ParsedEmail): CandidateJob[] {
  const html = email.html ?? "";
  const domain = senderDomain(email.from);
  if (!html && !email.text) return [];

  let cands: CandidateJob[];
  if (domain.includes("seek")) cands = parseSeek(html);
  else if (domain.includes("indeed")) cands = parseIndeed(html);
  else if (domain.includes("linkedin")) cands = parseLinkedIn(html);
  else if (domain.includes("jora")) cands = parseJora(html);
  else cands = parseGeneric(html);

  // Apply work-type hint from subject when the listing text didn't carry one.
  const subjType = detectWorkType(email.subject);
  if (subjType !== "unknown") {
    for (const c of cands) if (c.workType === "unknown") c.workType = subjType;
  }
  return dedupeByUrl(cands);
}

export function parseSeek(html: string): CandidateJob[] {
  return anchorsToCandidates(extractAnchors(html), /seek\.com\.au\/job\//i, 0.7);
}

export function parseIndeed(html: string): CandidateJob[] {
  return anchorsToCandidates(extractAnchors(html), /indeed\.com\/(rc\/clk|viewjob|job)/i, 0.65);
}

export function parseLinkedIn(html: string): CandidateJob[] {
  return anchorsToCandidates(extractAnchors(html), /linkedin\.com\/(jobs\/view|comm\/jobs)/i, 0.65);
}

export function parseJora(html: string): CandidateJob[] {
  return anchorsToCandidates(extractAnchors(html), /jora\.com\/job/i, 0.65);
}

/** Generic fallback: treat job-title-like anchors to external sites as candidates. */
export function parseGeneric(html: string): CandidateJob[] {
  const anchors = extractAnchors(html).filter(
    (a) => a.text.length >= 6 && a.text.length <= 90 && !NOISE.test(a.text) && /[a-z]/i.test(a.text),
  );
  return anchors.map((a) => {
    const url = canonicalizeUrl(a.href);
    return {
      title: a.text,
      company: null,
      location: null,
      salaryText: null,
      workType: detectWorkType(a.text),
      applyUrl: url,
      sourceUrl: url,
      snippet: null,
      confidence: 0.35,
    } satisfies CandidateJob;
  });
}
