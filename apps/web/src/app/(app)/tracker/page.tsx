import Link from "next/link";
import { JOB_STATUS_LABELS, type JobStatus, type JobDTO } from "@jobpilot/shared";
import { PageHeader, ScoreBadge } from "@/components/ui";
import { serverFetch } from "@/lib/api";

interface BoardColumn {
  status: JobStatus;
  cards: JobDTO[];
}

// Columns shown on the board (most useful subset; full status list lives on jobs).
const VISIBLE: JobStatus[] = [
  "new",
  "to_review",
  "good_match",
  "prepared",
  "applied",
  "follow_up",
  "interview",
  "offer",
];

export default async function TrackerPage() {
  const data = await serverFetch<{ columns: BoardColumn[] }>("/api/tracker/board");
  if (!data) return null;
  const byStatus = new Map(data.columns.map((c) => [c.status, c.cards]));

  return (
    <div>
      <PageHeader title="Tracker" subtitle="Your pipeline by status. Open a job to change its status." />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {VISIBLE.map((status) => {
          const cards = byStatus.get(status) ?? [];
          return (
            <div key={status} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{JOB_STATUS_LABELS[status]}</h3>
                <span className="text-xs text-slate-400">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={job.matchScore} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{job.title}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{job.company ?? "—"}</p>
                    </div>
                  </Link>
                ))}
                {cards.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400 dark:border-slate-800">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
