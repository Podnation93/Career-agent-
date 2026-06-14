"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobDTO } from "@jobpilot/shared";
import { Button, Card, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/client";

type Tab = "text" | "url" | "file";

export default function ImportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ job: JobDTO; duplicateOf?: string; warnings?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let body: Record<string, unknown>;
      if (tab === "text") body = { kind: "text", text };
      else if (tab === "url") body = { kind: "url", url, text: text || undefined };
      else {
        const fileInput = document.querySelector<HTMLInputElement>("#jobfile");
        const file = fileInput?.files?.[0];
        if (!file) throw new Error("Choose a file first.");
        const b64 = await fileToBase64(file);
        body = { kind: "file", fileBase64: b64, filename: file.name };
      }
      const res = await apiFetch<typeof result>("/api/import/manual", { method: "POST", body: JSON.stringify(body) });
      setResult(res);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Import a job" subtitle="Paste text or a URL, or upload a job ad. Nothing is scraped or auto-applied." />

      <div className="mb-4 flex gap-2">
        {(["text", "url", "file"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t ? "bg-brand-600 text-white" : "bg-slate-200 dark:bg-slate-800"
            }`}
          >
            {t === "text" ? "Paste text" : t === "url" ? "Paste URL" : "Upload file"}
          </button>
        ))}
      </div>

      <Card className="space-y-3">
        {tab === "url" && (
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="https://employer.com/careers/it-support-analyst"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
        {tab === "file" && (
          <input id="jobfile" type="file" accept=".txt,.pdf,.md" className="text-sm" />
        )}
        {tab !== "file" && (
          <textarea
            className="h-48 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder={tab === "url" ? "Optional: paste the job description text here too" : "Paste the full job ad here…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={submit} disabled={busy}>
          {busy ? "Importing…" : "Import & score"}
        </Button>
      </Card>

      {result && (
        <Card className="mt-4">
          {result.duplicateOf ? (
            <p className="text-sm text-amber-700">This looks like a duplicate of an existing job.</p>
          ) : (
            <p className="text-sm text-emerald-700">Imported and scored.</p>
          )}
          <a className="mt-2 inline-block text-brand-600 hover:underline" href={`/jobs/${result.job.id}`}>
            View “{result.job.title}” (score {result.job.matchScore ?? "–"}) →
          </a>
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="mt-6 border-dashed">
        <h3 className="font-medium">Gmail import</h3>
        <p className="mt-1 text-sm text-slate-500">
          Connect Gmail to import your own job-alert emails (read-only). Lands in Phase 4 — see docs/GMAIL_IMPORT.md.
        </p>
      </Card>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
