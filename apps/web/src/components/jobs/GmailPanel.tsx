"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GmailStatusDTO } from "@jobpilot/shared";
import { Button, Card } from "@/components/ui";
import { apiFetch } from "@/lib/client";

interface ScanResult {
  scanned: number;
  newMessages: number;
  imported: number;
  duplicates: number;
}

export function GmailPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<GmailStatusDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setStatus(await apiFetch<GmailStatusDTO>("/api/gmail/status"));
    } catch {
      /* not logged in / no status */
    }
  }

  useEffect(() => {
    void refresh();
    // Surface ?gmail=connected|denied after the OAuth redirect.
    const params = new URLSearchParams(window.location.search);
    const g = params.get("gmail");
    if (g === "denied") setError("Gmail connection was denied.");
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/gmail/connect");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Gmail connection");
      setBusy(false);
    }
  }

  async function runScan() {
    setBusy(true);
    setError(null);
    setScan(null);
    try {
      const res = await apiFetch<ScanResult>("/api/gmail/scan", { method: "POST", body: JSON.stringify({}) });
      setScan(res);
      router.refresh();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await apiFetch("/api/gmail/disconnect", { method: "DELETE" });
      setScan(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <h3 className="font-medium">Gmail import</h3>
      <p className="mt-1 text-sm text-slate-500">
        Connect Gmail to import your own job-alert emails (read-only). Nothing is sent or auto-applied; tokens are
        encrypted at rest.
      </p>

      {status?.connected ? (
        <div className="mt-3">
          <p className="text-sm text-emerald-700">
            Connected as {status.googleEmail ?? "your account"}
            {status.lastScanAt && (
              <span className="text-slate-400"> · last scan {new Date(status.lastScanAt).toLocaleString()}</span>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={runScan} disabled={busy}>
              {busy ? "Scanning…" : "Scan now"}
            </Button>
            <Button variant="ghost" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {status?.status === "error" && (
            <p className="mb-2 text-sm text-amber-700">Authorization expired — reconnect to continue.</p>
          )}
          <Button onClick={connect} disabled={busy}>
            {busy ? "…" : "Connect Gmail"}
          </Button>
          <p className="mt-2 text-xs text-slate-400">Requires Google OAuth setup — see docs/GMAIL_SETUP.md.</p>
        </div>
      )}

      {scan && (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Scanned {scan.scanned} emails · {scan.newMessages} new · imported {scan.imported} job
          {scan.imported === 1 ? "" : "s"} · {scan.duplicates} duplicate{scan.duplicates === 1 ? "" : "s"}.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
