import Link from "next/link";
import { notFound } from "next/navigation";
import type { JobDetailDTO } from "@jobpilot/shared";
import { ApplyButton } from "@/components/jobs/ApplyButton";
import { GenerateDocs } from "@/components/jobs/GenerateDocs";
import { StatusSelect } from "@/components/jobs/StatusSelect";
import { Card, RecommendationPill, ScoreBadge, SkillPill } from "@/components/ui";
import { serverFetch } from "@/lib/api";
import { formatSalary } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  role: "Role fit",
  skills: "Skills",
  location: "Location",
  experience: "Experience",
  salary: "Salary",
  effort: "Effort",
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverFetch<{ job: JobDetailDTO }>(`/api/jobs/${id}`);
  if (!data) notFound();
  const job = data.job;
  const score = job.latestScore;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/jobs" className="text-sm text-brand-600 hover:underline">
        ← Back to jobs
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="mt-1 text-slate-500">
            {job.company ?? "—"} · {job.location ?? "—"} · {job.workType} · {formatSalary(job)}
          </p>
        </div>
        <StatusSelect jobId={job.id} status={job.status} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: score + skills + strategy + description */}
        <div className="space-y-6 lg:col-span-2">
          {score ? (
            <Card>
              <div className="flex items-center gap-4">
                <ScoreBadge score={score.score} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{score.score}/100</span>
                    <RecommendationPill rec={score.recommendation} />
                  </div>
                  <p className="text-sm text-slate-500">{score.reason}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Object.entries(score.categoryScores).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{CATEGORY_LABELS[k] ?? k}</span>
                      <span>{v}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${v}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="text-sm text-slate-500">Not scored yet.</Card>
          )}

          <Card>
            <h2 className="mb-2 font-semibold">Skills</h2>
            {job.skills.length === 0 ? (
              <p className="text-sm text-slate-400">No skills detected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {job.skills.map((s) => (
                  <SkillPill key={s.id} name={s.name} matched={s.matched} />
                ))}
              </div>
            )}
            {score && score.missingSkills.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                ⚠️ Do not claim skills you don&apos;t have: {score.missingSkills.join(", ")}. Mention your
                cybersecurity study and transferable experience instead.
              </p>
            )}
          </Card>

          {score && (
            <Card>
              <h2 className="mb-2 font-semibold">Strategy</h2>
              <p className="text-sm"><strong>Resume:</strong> {score.resumeStrategy}</p>
              <p className="mt-2 text-sm"><strong>Cover letter:</strong> {score.coverLetterAngle}</p>
              {score.interviewPoints.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {score.interviewPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <h2 className="mb-2 font-semibold">Documents</h2>
            <GenerateDocs jobId={job.id} documents={job.documents} />
          </Card>

          {job.description && (
            <Card>
              <h2 className="mb-2 font-semibold">Job description</h2>
              <pre className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{job.description}</pre>
            </Card>
          )}
        </div>

        {/* Right: apply + timeline */}
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">Apply</h2>
            <ApplyButton jobId={job.id} applyUrl={job.applyUrl ?? job.sourceUrl} />
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Timeline</h2>
            {job.events.length === 0 ? (
              <p className="text-sm text-slate-400">No activity yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {job.events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span className="capitalize text-slate-600 dark:text-slate-300">{e.type.replace(/_/g, " ")}</span>
                    <span className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
