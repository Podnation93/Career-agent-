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
        {documents.map((doc) => (
          <details key={doc.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-medium">
              {doc.title} <span className="text-xs text-slate-400">({doc.provider})</span>
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{doc.body}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}
