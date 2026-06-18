"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_KINDS, type DocumentKind, type GeneratedDocumentDTO } from "@jobpilot/shared";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/client";

const LABELS: Record<DocumentKind, string> = {
  resume_notes: "Resume notes",
  cover_letter: "Cover letter",
  screening_answers: "Screening answers",
  interview_prep: "Interview prep",
};

export function GenerateDocs({ jobId, documents }: { jobId: string; documents: GeneratedDocumentDTO[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<DocumentKind | null>(null);

  async function generate(kind: DocumentKind) {
    setBusy(kind);
    try {
      await apiFetch(`/api/jobs/${jobId}/documents`, { method: "POST", body: JSON.stringify({ kind }) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {DOCUMENT_KINDS.map((kind) => (
          <Button key={kind} variant="ghost" disabled={busy === kind} onClick={() => generate(kind)}>
            {busy === kind ? "Generating…" : `Generate ${LABELS[kind]}`}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {documents.length === 0 && (
          <p className="text-sm text-slate-400">No documents yet. Generate truthful, tailored drafts above.</p>
        )}
        {documents.map((doc) => {
          const doNotClaim = (doc.metadata?.doNotClaim as string[] | undefined) ?? [];
          return (
            <details key={doc.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <summary className="cursor-pointer text-sm font-medium">
                {doc.title} <span className="text-xs text-slate-400">({doc.provider})</span>
              </summary>
              {doNotClaim.length > 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  ⚠️ Do not claim: {doNotClaim.join(", ")} — not in your profile.
                </p>
              )}
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{doc.body}</pre>
              <div className="mt-2 flex gap-3 text-xs">
                <a className="text-brand-600 hover:underline" href={`/api/documents/${doc.id}/export?format=md`}>
                  Export .md
                </a>
                <a className="text-brand-600 hover:underline" href={`/api/documents/${doc.id}/export?format=txt`}>
                  Export .txt
                </a>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
