"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/client";

interface SettingsDTO {
  aiProvider: string;
  gmail: { connected: boolean; googleEmail?: string | null };
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    apiFetch<SettingsDTO>("/api/settings").then(setSettings).catch(() => {});
  }, []);

  async function deleteAll() {
    setDeleteError(null);
    try {
      await apiFetch("/api/settings/delete-all-data", {
        method: "POST",
        body: JSON.stringify({ password: confirmPassword }),
      });
      setDeleted(true);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <h2 className="font-semibold">AI provider</h2>
        <p className="mt-1 text-sm text-slate-500">
          Current: <strong>{settings?.aiProvider ?? "…"}</strong>. Set <code>AI_PROVIDER</code> (heuristic / anthropic /
          openai) in the environment. The deterministic heuristic engine is always the fallback.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold">Gmail</h2>
        <p className="mt-1 text-sm text-slate-500">
          {settings?.gmail.connected ? `Connected as ${settings.gmail.googleEmail}` : "Not connected."} Read-only job-alert
          import lands in Phase 4 (see docs/GMAIL_IMPORT.md).
        </p>
      </Card>

      <Card className="border-red-200 dark:border-red-900/50">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-500">
          Permanently delete all your jobs, documents, imports, and Gmail connection. Confirm with your password.
        </p>
        {deleted ? (
          <p className="mt-3 text-sm text-emerald-600">All data deleted.</p>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              placeholder="Your password"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button variant="danger" onClick={deleteAll} disabled={!confirmPassword}>
              Delete all data
            </Button>
          </div>
        )}
        {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
      </Card>
    </div>
  );
}
