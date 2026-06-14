import Link from "next/link";
import type { DashboardSummaryDTO } from "@jobpilot/shared";
import { Card, PageHeader, ScoreBadge, StatusChip } from "@/components/ui";
import { serverFetch } from "@/lib/api";
import { formatSalary } from "@/lib/format";

const STAT_CARDS: { key: keyof DashboardSummaryDTO; label: string }[] = [
  { key: "newJobs", label: "New jobs" },
  { key: "goodMatches", label: "Good matches" },
  { key: "applied", label: "Applications" },
  { key: "interviews", label: "Interviews" },
  { key: "followUpsDue", label: "Follow-ups due" },
];

export default async function DashboardPage() {
  const summary = await serverFetch<DashboardSummaryDTO>("/api/dashboard/summary");
  if (!summary) return null;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your job search at a glance" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {STAT_CARDS.map((s) => (
          <Card key={s.key} className="text-center">
            <div className="text-3xl font-bold text-brand-600">{summary[s.key] as number}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Top matches</h2>
      <div className="space-y-2">
        {summary.recentJobs.length === 0 && (
          <Card className="text-sm text-slate-500">
            No jobs yet. <Link className="text-brand-600 hover:underline" href="/import">Import your first job →</Link>
          </Card>
        )}
        {summary.recentJobs.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`}>
            <Card className="flex items-center gap-4 transition hover:border-brand-300">
              <ScoreBadge score={job.matchScore} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{job.title}</div>
                <div className="truncate text-sm text-slate-500">
                  {job.company ?? "—"} · {job.location ?? "—"} · {formatSalary(job)}
                </div>
              </div>
              <StatusChip status={job.status} />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
