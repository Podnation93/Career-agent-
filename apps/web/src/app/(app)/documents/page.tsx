import Link from "next/link";
import type { JobDTO, PaginatedDTO } from "@jobpilot/shared";
import { Card, PageHeader } from "@/components/ui";
import { serverFetch } from "@/lib/api";

/**
 * Documents are generated per-job. This page links to jobs that have generated
 * material; full cross-job document browsing/export lands in Phase 3.
 */
export default async function DocumentsPage() {
  const data = await serverFetch<PaginatedDTO<JobDTO>>("/api/jobs?sort=newest&pageSize=50");
  if (!data) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Documents" subtitle="Generate tailored, truthful drafts from each job's detail page." />
      <Card className="text-sm text-slate-500">
        Open a job and use the <strong>Documents</strong> panel to generate resume notes, a cover letter, screening
        answers, and interview prep. Export (PDF/DOCX) lands in Phase 3.
      </Card>
      <div className="mt-4 space-y-2">
        {data.items.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`}>
            <Card className="flex items-center justify-between transition hover:border-brand-300">
              <span className="truncate text-sm font-medium">{job.title}</span>
              <span className="text-xs text-slate-400">{job.company ?? "—"}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
