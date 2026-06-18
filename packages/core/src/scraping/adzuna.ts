/**
 * Adzuna source — uses Adzuna's official, documented JSON API (not scraping).
 * Adzuna legally aggregates many Australian job boards. Requires a free
 * app id + key from https://developer.adzuna.com.
 *
 * Docs: https://developer.adzuna.com/docs/search
 */
import type { WorkType } from "@jobpilot/shared";

export interface AdzunaCreds {
  appId: string;
  appKey: string;
}

export interface AdzunaSearchParams {
  keywords: string;
  location?: string;
  pages?: number;
}

export interface ScrapedListing {
  source: "adzuna";
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  workType: WorkType;
  salaryText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  url: string;
  description: string;
  listingDate: string | null;
}

function detectWorkType(text: string): WorkType {
  const t = text.toLowerCase();
  if (t.includes("remote")) return "remote";
  if (t.includes("hybrid")) return "hybrid";
  return "unknown";
}

function moneyText(min?: number | null, max?: number | null): string | null {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
  if (min && max) return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `up to ${fmt(max)}`;
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapResult(r: any): ScrapedListing | null {
  if (!r?.id || !r?.title) return null;
  const description: string = (r.description ?? "").toString();
  const blob = `${r.title} ${description} ${r.contract_time ?? ""}`;
  return {
    source: "adzuna",
    externalId: String(r.id),
    title: String(r.title).replace(/<[^>]+>/g, "").trim(),
    company: r.company?.display_name ?? null,
    location: r.location?.display_name ?? null,
    workType: detectWorkType(blob),
    salaryText: moneyText(r.salary_min, r.salary_max),
    salaryMin: r.salary_min ?? null,
    salaryMax: r.salary_max ?? null,
    url: r.redirect_url ?? "",
    description: description.replace(/<[^>]+>/g, "").trim(),
    listingDate: r.created ?? null,
  };
}

/** Search Adzuna AU and return mapped listings. Throws if creds are missing/invalid. */
export async function searchAdzuna(
  creds: AdzunaCreds,
  params: AdzunaSearchParams,
): Promise<ScrapedListing[]> {
  if (!creds.appId || !creds.appKey) {
    throw new Error("Adzuna API credentials are not configured (ADZUNA_APP_ID / ADZUNA_APP_KEY).");
  }
  const pages = Math.max(1, Math.min(params.pages ?? 1, 3));
  const out: ScrapedListing[] = [];
  for (let p = 1; p <= pages; p++) {
    const qs = new URLSearchParams({
      app_id: creds.appId,
      app_key: creds.appKey,
      results_per_page: "20",
      what: params.keywords,
      "content-type": "application/json",
    });
    if (params.location) qs.set("where", params.location);
    const url = `https://api.adzuna.com/v1/api/jobs/au/search/${p}?${qs.toString()}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Adzuna HTTP ${res.status}${res.status === 401 ? " (check your app id/key)" : ""}`);
    }
    const data = (await res.json()) as { results?: any[] };
    const results = data.results ?? [];
    if (results.length === 0) break;
    for (const r of results) {
      const mapped = mapResult(r);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}
