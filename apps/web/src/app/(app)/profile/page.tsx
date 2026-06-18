"use client";

import { useEffect, useState } from "react";
import type { ProfileDTO } from "@jobpilot/shared";
import { Button, Card, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/client";

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [careerGoals, setCareerGoals] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: ProfileDTO }>("/api/profile").then(({ profile: p }) => {
      setProfile(p);
      setHeadline(p.headline ?? "");
      setSummary(p.summary ?? "");
      setSkills(p.skills.map((s) => s.name).join(", "));
      setRoles(p.targetRoles.join(", "));
      setLocations(p.targetLocations.join(", "));
      setSalaryMin(p.salaryGoalMin?.toString() ?? "");
      setSalaryMax(p.salaryGoalMax?.toString() ?? "");
      setCareerGoals(p.careerGoals ?? "");
    });
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const body = {
        headline,
        summary,
        skills: splitList(skills).map((name) => ({ name })),
        targetRoles: splitList(roles),
        targetLocations: splitList(locations),
        acceptRemote: profile?.acceptRemote ?? true,
        acceptHybrid: profile?.acceptHybrid ?? true,
        acceptCbd: profile?.acceptCbd ?? true,
        salaryGoalMin: salaryMin ? Number(salaryMin) : undefined,
        salaryGoalMax: salaryMax ? Number(salaryMax) : undefined,
        careerGoals,
      };
      await apiFetch("/api/profile", { method: "PUT", body: JSON.stringify(body) });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" subtitle="Used to score jobs and tailor documents. Keep it truthful." />
      <Card className="space-y-4">
        <Field label="Headline">
          <input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </Field>
        <Field label="Summary">
          <textarea className={`${inputCls} h-24`} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="Skills (comma separated)">
          <textarea className={`${inputCls} h-20`} value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>
        <Field label="Target roles (comma separated)">
          <textarea className={`${inputCls} h-20`} value={roles} onChange={(e) => setRoles(e.target.value)} />
        </Field>
        <Field label="Target locations (comma separated)">
          <textarea className={`${inputCls} h-20`} value={locations} onChange={(e) => setLocations(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salary goal min (AUD)">
            <input className={inputCls} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
          </Field>
          <Field label="Salary goal max (AUD)">
            <input className={inputCls} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
          </Field>
        </div>
        <Field label="Career goals">
          <textarea className={`${inputCls} h-20`} value={careerGoals} onChange={(e) => setCareerGoals(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
        </div>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
