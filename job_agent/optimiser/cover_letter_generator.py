"""Cover letter generator.

Produces two versions per job:

* a short recruiter version (3-4 sentences for an email / quick screen), and
* a full version (proper letter).

Both draw on the candidate's stored cover-letter style, career story and
motivations, and reference the specific company, role and required skills — never
a generic template. An LLM polishes the output when configured; otherwise a
personalised deterministic template is used.
"""

from __future__ import annotations

from ..ai import AIProvider
from ..models import Job, Profile

SYSTEM = (
    "You are an expert cover-letter writer. Match the candidate's own voice and "
    "the style sample provided. Be specific to the company and role, reference "
    "genuine matching skills only, and never fabricate experience. Keep it warm, "
    "confident and concise."
)


class CoverLetterGenerator:
    def __init__(self, ai: AIProvider, profile: Profile):
        self.ai = ai
        self.profile = profile
        self.profile_skills = {s.lower() for s in profile.all_skills()}

    def _matching_skills(self, job: Job) -> list[str]:
        return [k for k in job.skills_detected() if k.lower() in self.profile_skills]

    # ── deterministic fallbacks ────────────────────────────────────────────────

    def _short_template(self, job: Job) -> str:
        skills = self._matching_skills(job)
        skills_phrase = ", ".join(skills[:3]) if skills else "my IT background"
        name = self.profile.name or "I"
        return (
            f"Hi,\n\nI'd love to be considered for the {job.title} role at "
            f"{job.company}. With hands-on strengths in {skills_phrase}, I'm "
            f"confident I can add value from day one. I'd welcome a chat about how "
            f"my experience fits your team.\n\nKind regards,\n{name}"
        )

    def _full_template(self, job: Job) -> str:
        p = self.profile
        skills = self._matching_skills(job)
        skills_phrase = ", ".join(skills[:5]) if skills else "a solid IT foundation"
        story = p.career_story or (
            "I've built my career solving real technical problems and keeping users "
            "productive."
        )
        motivation = p.motivations or (
            "I'm motivated by work that has clear impact and room to grow."
        )
        name = p.name or "Your name"
        return (
            f"Dear {job.company} Hiring Team,\n\n"
            f"I'm writing to apply for the {job.title} position. {story}\n\n"
            f"The role stood out to me because it calls for {skills_phrase} — areas "
            f"where I have direct, hands-on experience. {motivation}\n\n"
            f"I'm particularly drawn to {job.company} and would relish the chance to "
            f"contribute to your team while continuing to develop my skills.\n\n"
            f"Thank you for considering my application. I'd be glad to discuss how I "
            f"can help.\n\nKind regards,\n{name}\n"
            + (f"{p.email}" if p.email else "")
        )

    # ── public API ─────────────────────────────────────────────────────────────

    def _polish(self, job: Job, draft: str, length: str) -> str:
        style = self.profile.cover_letter_style or "(no sample provided)"
        prompt = (
            f"Write a {length} cover letter for the job below in the candidate's "
            f"voice. Match the tone and structure of their style sample. Reference "
            f"the company and the specific role and use only genuine matching "
            f"skills. Return only the letter.\n\n"
            f"=== JOB ===\nTitle: {job.title}\nCompany: {job.company}\n"
            f"Description: {job.description}\n\n"
            f"=== CANDIDATE STYLE SAMPLE ===\n{style}\n\n"
            f"=== CAREER STORY ===\n{self.profile.career_story}\n\n"
            f"=== MOTIVATIONS ===\n{self.profile.motivations}\n\n"
            f"=== MATCHING SKILLS ===\n{', '.join(self._matching_skills(job))}\n\n"
            f"=== STARTING DRAFT ===\n{draft}"
        )
        polished = self.ai.generate(prompt, system=SYSTEM, max_tokens=1200)
        return polished or draft

    def short(self, job: Job) -> str:
        return self._polish(job, self._short_template(job), "short 3-4 sentence recruiter")

    def full(self, job: Job) -> str:
        return self._polish(job, self._full_template(job), "full professional")
