"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobDTO } from "@jobpilot/shared";
import { Button, Card, ScoreBadge } from "@/components/ui";
import { apiFetch } from "@/lib/client";

type SearchResult = { found: number; imported: number; duplicates: number; jobs: JobDTO[] };

const SOURCES = [
  { key: "seek", label: "Seek", defaultLocation: "All Melbourne VIC", note: "Scrapes live Seek listings with full descriptions." },
  { key: "adzuna", label: "Adzuna (many boards)", defaultLocation: "Melbourne VIC", note: "Official API — set ADZUNA_APP_ID/KEY in .env. Aggregates many AU boards." },
] as const;

export function JobSearchPanel() {
  const router = useRouter();
  const [source, setSource] = useState<(typeof SOURCES)[number]["key"]>("seek");
  const [keywords, setKeywords] = useState("cyber security analyst");
  const [location, setLocation] = useState("All Melbourne VIC");
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = SOURCES.find((s) => s.key === source)!;

  function pickSource(key: (typeof SOURCES)[number]["key"]) {
    setSource(key);
    setLocation(SOURCES.find((s) => s.key === key)!.defaultLocation);
  }

  async function search() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<SearchResult>(`/api/import/${source}`, {
        method: "POST",
        body: JSON.stringify({ keywords, location, pages }),
      });
      setResult(res);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Search job boards</h2>
        <p className="text-xs text-slate-500">{active.note} You always apply yourself.</p>
      </div>

      <div className="flex gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            onClick={() => pickSource(s.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              source === s.key ? "bg-brand-600 text-white" : "bg-slate-200 dark:bg-slate-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          placeholder="Keywords e.g. SOC analyst"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          value={pages}
          onChange={(e) => setPages(Number(e.target.value))}
          title="Result pages"
        >
          <option value={1}>1 page</option>
          <option value={2}>2 pages</option>
          <option value={3}>3 pages</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={search} disabled={busy || !keywords.trim()}>
        {busy ? `Searching ${active.label}…` : `Search ${active.label} & import`}
      </Button>

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-700">
            Found {result.found} · imported {result.imported} new · {result.duplicates} already saved.
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.jobs.slice(0, 12).map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                <a className="truncate text-sm text-brand-600 hover:underline" href={`/jobs/${j.id}`}>
                  {j.title} — {j.company ?? "—"}
                </a>
                <ScoreBadge score={j.matchScore ?? null} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
