"use client";

import { useRouter } from "next/navigation";
import { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from "@jobpilot/shared";
import { apiFetch } from "@/lib/client";

export function StatusSelect({ jobId, status }: { jobId: string; status: JobStatus }) {
  const router = useRouter();

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await apiFetch(`/api/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: e.target.value }),
    });
    router.refresh();
  }

  return (
    <select
      value={status}
      onChange={onChange}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
    >
      {JOB_STATUSES.map((s) => (
        <option key={s} value={s}>
          {JOB_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
