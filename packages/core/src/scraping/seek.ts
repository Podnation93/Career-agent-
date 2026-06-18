/**
 * Seek (seek.com.au) scraper.
 *
 * Seek's public search results page server-embeds the full result set as JSON in
 * `window.SEEK_REDUX_DATA`, and each job detail page embeds the full ad body in
 * `window.SEEK_APOLLO_DATA`. We read those directly — no headless browser, no
 * login. This pulls real listings (title, company, location, salary, work type,
 * URL, description) into the normal import pipeline.
 *
 * NOTE: scraping Seek is against its Terms of Service and the markup/embedded
 * shape can change without notice; treat this as best-effort and expect to
 * maintain it. Used here for a single user's personal job search.
 */
import type { WorkType } from "@jobpilot/shared";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BASE = "https://www.seek.com.au";

export interface SeekSearchParams {
  keywords: string;
  location?: string;
  pages?: number; // result pages to fetch (32 jobs each), default 1
}

export interface ScrapedJob {
  source: "seek";
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  workType: WorkType;
  salaryText: string | null;
  url: string;
  description: string;
  teaser: string | null;
  listingDate: string | null;
}

/** Extract a `window.<VAR> = {...};` JSON blob from page HTML (string-aware brace match). */
function extractAssignedJson(html: string, varName: string): unknown | null {
  const marker = `window.${varName} = `;
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length;
  const objStart = html.indexOf("{", i);
  if (objStart < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (i = objStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(objStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mapWorkType(displayText?: string, workTypes?: string[]): WorkType {
  const t = (displayText ?? "").toLowerCase();
  if (t.includes("remote")) return "remote";
  if (t.includes("hybrid")) return "hybrid";
  if (t.includes("on site") || t.includes("on-site") || t.includes("office")) return "onsite";
  const wt = (workTypes ?? []).join(" ").toLowerCase();
  if (wt.includes("remote")) return "remote";
  return "unknown";
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-AU,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Seek HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Build the human search URL Seek serves (with embedded data). */
function searchUrl(keywords: string, location: string | undefined, page: number): string {
  const kw = keywords.trim().replace(/\s+/g, "-").toLowerCase();
  const path = `/${encodeURIComponent(kw)}-jobs`;
  const where = location ? `/in-${encodeURIComponent(location.trim().replace(/\s+/g, "-"))}` : "";
  const q = page > 1 ? `?page=${page}` : "";
  return `${BASE}${path}${where}${q}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapListing(j: any): ScrapedJob | null {
  if (!j?.id || !j?.title) return null;
  const bullets: string[] = Array.isArray(j.bulletPoints) ? j.bulletPoints : [];
  const teaser: string | null = j.teaser ?? null;
  const descParts = [teaser, ...bullets].filter(Boolean) as string[];
  const locations: string[] = Array.isArray(j.locations)
    ? j.locations.map((l: any) => l?.label ?? l?.text).filter(Boolean)
    : [];
  return {
    source: "seek",
    externalId: String(j.id),
    title: String(j.title),
    company: j.advertiser?.description ?? j.companyName ?? null,
    location: locations.join(", ") || null,
    workType: mapWorkType(j.workArrangements?.displayText, j.workTypes),
    salaryText: j.salaryLabel ?? null,
    url: `${BASE}/job/${j.id}`,
    description: descParts.join("\n• ").trim(),
    teaser,
    listingDate: j.listingDate ?? null,
  };
}

/** Search Seek and return mapped listings (teaser-level description). */
export async function searchSeek(params: SeekSearchParams): Promise<ScrapedJob[]> {
  const pages = Math.max(1, Math.min(params.pages ?? 1, 5));
  const out: ScrapedJob[] = [];
  for (let p = 1; p <= pages; p++) {
    const html = await getHtml(searchUrl(params.keywords, params.location, p));
    const redux = extractAssignedJson(html, "SEEK_REDUX_DATA") as any;
    const jobs: any[] = redux?.results?.results?.jobs ?? [];
    if (jobs.length === 0) break;
    for (const j of jobs) {
      const mapped = mapListing(j);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}

/**
 * Pull the longest `"content":"…"` JSON string literal out of raw page HTML.
 * The Seek job-ad body is embedded as an escaped JSON string and is by far the
 * largest such field, so "longest wins" reliably selects the ad over promo blurbs.
 */
function longestEmbeddedContent(html: string): string {
  const needle = '"content":"';
  let best = "";
  let from = 0;
  for (;;) {
    const at = html.indexOf(needle, from);
    if (at < 0) break;
    const open = at + needle.length - 1; // index of the opening quote
    // walk to the closing unescaped quote
    let i = open + 1;
    let esc = false;
    for (; i < html.length; i++) {
      const c = html[i];
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') break;
    }
    try {
      const decoded = JSON.parse(html.slice(open, i + 1)) as string;
      if (decoded.includes("<") && decoded.length > best.length) best = decoded;
    } catch {
      /* ignore malformed slice */
    }
    from = i + 1;
  }
  return best;
}

/** Fetch the full job-ad body text from a Seek detail page (best effort). */
export async function fetchSeekDescription(externalId: string): Promise<string | null> {
  try {
    const html = await getHtml(`${BASE}/job/${externalId}`);
    const content = longestEmbeddedContent(html);
    if (content) {
      const text = htmlToText(content);
      if (text.length > 120) return text;
    }
    return null;
  } catch {
    return null;
  }
}
