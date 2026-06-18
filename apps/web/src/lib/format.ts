import type { JobDTO } from "@jobpilot/shared";

export function formatSalary(job: Pick<JobDTO, "salaryMin" | "salaryMax" | "salaryText">): string {
  if (job.salaryText) return job.salaryText;
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`;
  if (job.salaryMin && job.salaryMax) return `${fmt(job.salaryMin)}–${fmt(job.salaryMax)}`;
  if (job.salaryMin) return `${fmt(job.salaryMin)}+`;
  return "—";
}

export function scoreColor(score: number | null): string {
  if (score == null) return "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  if (score >= 75) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (score >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
}

export function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
