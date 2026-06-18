"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/client";

/**
 * The Apply button is a plain anchor to the employer's own URL — JobPilot never
 * submits anything. After the user opens it, we ask whether they applied and
 * record the outcome.
 */
export function ApplyButton({ jobId, applyUrl }: { jobId: string; applyUrl: string | null }) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  async function record(type: "marked_applied" | "marked_not_applied") {
    setBusy(true);
    try {
      await apiFetch(`/api/tracker/${jobId}/event`, { method: "POST", body: JSON.stringify({ type }) });
      setShowDialog(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onApplyClick() {
    // Log that the user opened the official apply page, then show the prompt.
    await apiFetch(`/api/tracker/${jobId}/event`, {
      method: "POST",
      body: JSON.stringify({ type: "opened_apply" }),
    }).catch(() => {});
    setShowDialog(true);
  }

  if (!applyUrl) {
    return <p className="text-sm text-slate-400">No apply URL on this job. Add one to enable Apply.</p>;
  }

  return (
    <div>
      <a href={applyUrl} target="_blank" rel="noopener noreferrer" onClick={onApplyClick}>
        <Button className="w-full">Apply on original site ↗</Button>
      </a>
      <p className="mt-2 text-center text-xs text-slate-400">Opens the employer&apos;s page. You submit it yourself.</p>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Did you apply?</h3>
            <p className="mt-1 text-sm text-slate-500">Record the outcome so the tracker stays up to date.</p>
            <div className="mt-4 space-y-2">
              <Button className="w-full" disabled={busy} onClick={() => record("marked_applied")}>
                Yes — mark as Applied
              </Button>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={() => record("marked_not_applied")}>
                Not yet
              </Button>
              <button className="w-full text-center text-xs text-slate-400" onClick={() => setShowDialog(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
