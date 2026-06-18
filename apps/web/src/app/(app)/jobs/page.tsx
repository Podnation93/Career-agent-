import Link from "next/link";
import { JOB_STATUSES, type JobStatus, type PaginatedDTO, type JobDTO } from "@jobpilot/shared";
import { Card, PageHeader, RecommendationPill, ScoreBadge, StatusChip } from "@/components/ui";
import { serverFetch } from "@/lib/api";
import { formatSalary, relativeDate } from "@/lib/format";

type SearchParams = Promise<{ status?: string; sort?: string; q?: string; minScore?: string }>;

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  params.set("sort", sp.sort ?? "score");
  if (sp.q) params.set("q", sp.q);
  if (sp.minScore) params.set("minScore", sp.minScore);

  const data = await serverFetch<PaginatedDTO<JobDTO>>(`/api/jobs?${params.toString()}`);
  if (!data) return null;

  const makeHref = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `/jobs?${next.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Jobs" subtitle={`${data.total} imported`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Status:</span>
        <Link href={makeHref({ status: "" })} className="rounded-full bg-slate-200 px-3 py-1 text-xs dark:bg-slate-800">
          All
        </Link>
        {(["new", "good_match", "applied", "interview"] as JobStatus[]).map((s) => (
          <Link
            key={s}
            href={makeHref({ status: s })}
            className="rounded-full bg-slate-200 px-3 py-1 text-xs capitalize dark:bg-slate-800"
          >
            {s.replace("_", " ")}
          </Link>
        ))}
        <span className="ml-4 text-xs font-medium text-slate-500">Sort:</span>
        {["score", "newest", "salary"].map((s) => (
          <Link key={s} href={makeHref({ sort: s })} className="rounded-full bg-slate-200 px-3 py-1 text-xs dark:bg-slate-800">
            {s}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {data.items.length === 0 && <Card className="text-sm text-slate-500">No jobs match these filters.</Card>}
        {data.items.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`}>
            <Card className="flex items-center gap-4 transition hover:border-brand-300">
              <ScoreBadge score={job.matchScore} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{job.title}</span>
                  <RecommendationPill rec={job.recommendation} />
                </div>
                <div className="truncate text-sm text-slate-500">
                  {job.company ?? "—"} · {job.location ?? "—"} · {formatSalary(job)} · {job.workType}
                </div>
              </div>
              <div className="hidden text-right text-xs text-slate-400 sm:block">{relativeDate(job.dateFound)}</div>
              <StatusChip status={job.status} />
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Statuses available: {JOB_STATUSES.map((s) => s.replace("_", " ")).join(", ")}.
      </p>
    </div>
  );
}
