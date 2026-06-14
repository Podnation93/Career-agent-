import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { JOB_STATUS_LABELS, type JobStatus, type Recommendation } from "@jobpilot/shared";
import { scoreColor } from "@/lib/format";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Button({
  className,
  variant = "primary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "border border-slate-300 bg-transparent hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50",
        styles,
        className,
      )}
      {...rest}
    />
  );
}

export function ScoreBadge({ score }: { score: number | null }) {
  return (
    <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold", scoreColor(score))}>
      {score ?? "–"}
    </span>
  );
}

const STATUS_STYLES: Partial<Record<JobStatus, string>> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  good_match: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  applied: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  interview: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  offer: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export function StatusChip({ status }: { status: JobStatus }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", style)}>{JOB_STATUS_LABELS[status]}</span>;
}

export function RecommendationPill({ rec }: { rec: Recommendation | null }) {
  if (!rec) return null;
  const style = {
    apply: "bg-emerald-600 text-white",
    consider: "bg-amber-500 text-white",
    skip: "bg-slate-400 text-white",
  }[rec];
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide", style)}>{rec}</span>;
}

export function SkillPill({ name, matched }: { name: string; matched: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        matched
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      )}
    >
      {name}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
