"""Resume customisation engine.

For a given job it produces an ATS-friendly resume tailored to the role:

* a re-pointed professional summary,
* skills re-ordered so job-relevant skills lead,
* experience bullets prioritised by relevance to the job's keywords,
* job keywords surfaced — **only** ones the candidate genuinely has.

It never invents skills or experience. When an LLM provider is configured it is
used to polish wording; otherwise a deterministic template is used.
"""

from __future__ import annotations

from ..ai import AIProvider
from ..models import Job, Profile
from ..profile import skills as skillset

SYSTEM = (
    "You are an expert resume writer optimising for ATS. Rewrite truthfully — "
    "never invent skills, employers, dates or achievements. Keep it concise and "
    "professional. Mirror relevant keywords from the job only where the candidate "
    "genuinely has the experience."
)


class ResumeOptimiser:
    def __init__(self, ai: AIProvider, profile: Profile):
        self.ai = ai
        self.profile = profile
        self.profile_skills = {s.lower() for s in profile.all_skills()}

    def _relevant_keywords(self, job: Job) -> list[str]:
        """Job keywords the candidate actually has."""
        wanted = skillset.find_technical_skills(job.description) + \
            skillset.find_soft_skills(job.description)
        return [k for k in dict.fromkeys(wanted) if k.lower() in self.profile_skills]

    def _reorder_skills(self, job: Job) -> list[str]:
        relevant = self._relevant_keywords(job)
        rest = [s for s in self.profile.all_skills() if s not in relevant]
        return relevant + rest

    def _tailored_summary(self, job: Job) -> str:
        relevant = self._relevant_keywords(job)
        focus = ", ".join(relevant[:5]) if relevant else "relevant IT skills"
        base = self.profile.summary or (
            f"{self.profile.name or 'IT professional'} with hands-on experience "
            "across support and infrastructure."
        )
        return (
            f"{base}\n\nTargeting the {job.title} role at {job.company}, bringing "
            f"strengths in {focus}."
        )

    def _prioritised_history(self, job: Job) -> list[dict]:
        keywords = [k.lower() for k in self._relevant_keywords(job)]
        out = []
        for role in self.profile.work_history:
            bullets = role.responsibilities + role.achievements

            def relevance(text: str) -> int:
                low = text.lower()
                return sum(1 for k in keywords if k in low)

            ranked = sorted(bullets, key=relevance, reverse=True)
            out.append({
                "title": role.title,
                "company": role.company,
                "dates": f"{role.start} {role.end}".strip(),
                "bullets": ranked,
            })
        return out

    def _render_template(self, job: Job) -> str:
        p = self.profile
        lines: list[str] = []
        if p.name:
            lines.append(p.name)
        contact = " | ".join(x for x in (p.email, p.phone) if x)
        if contact:
            lines.append(contact)
        lines.append("")
        lines.append("PROFESSIONAL SUMMARY")
        lines.append(self._tailored_summary(job))
        lines.append("")
        lines.append("KEY SKILLS")
        lines.append(", ".join(self._reorder_skills(job)))
        if p.certifications:
            lines.append("")
            lines.append("CERTIFICATIONS")
            lines.append(", ".join(p.certifications))
        lines.append("")
        lines.append("EXPERIENCE")
        for role in self._prioritised_history(job):
            header = " — ".join(x for x in (role["title"], role["company"]) if x)
            if role["dates"]:
                header = f"{header} ({role['dates']})"
            lines.append(header)
            for b in role["bullets"]:
                lines.append(f"  • {b}")
            lines.append("")
        if p.education:
            lines.append("EDUCATION")
            for e in p.education:
                lines.append(f"  • {e}")
        if p.projects:
            lines.append("")
            lines.append("PROJECTS")
            for proj in p.projects:
                lines.append(f"  • {proj}")
        return "\n".join(lines).strip() + "\n"

    def build(self, job: Job) -> str:
        template = self._render_template(job)
        prompt = (
            "Rewrite and polish the following resume so it is tailored to the job "
            "below and ATS-friendly. Keep all facts identical — do not add skills "
            "or experience the candidate does not have. Return only the resume.\n\n"
            f"=== JOB ===\nTitle: {job.title}\nCompany: {job.company}\n"
            f"Description: {job.description}\n\n=== CURRENT TAILORED DRAFT ===\n{template}"
        )
        polished = self.ai.generate(prompt, system=SYSTEM, max_tokens=1800)
        return polished or template
