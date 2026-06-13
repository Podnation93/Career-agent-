"""Match scoring.

Produces a 0-100 overall score for a job against the candidate profile, broken
down into skills / experience / location / career-growth components, plus a plain
-English explanation of fit, requirements met, gaps and an apply recommendation.

The scoring is deterministic and transparent (no black box), so the candidate can
see exactly why a job ranked where it did.
"""

from __future__ import annotations

from ..config import Config
from ..location import LocationFilter
from ..models import Job, LocationMatch, Profile

# Default weights for the overall score. Tuned so location and skills dominate.
# Overridable via `matching.weights` in config.yaml.
WEIGHTS = {"skills": 0.40, "experience": 0.25, "location": 0.25, "growth": 0.10}

# Score given when a job ad has no detectable skill keywords. Deliberately at
# the midpoint (not above it) so keyword-sparse posts can't rank deceptively
# high. Overridable via `matching.min_neutral_skill_score`.
DEFAULT_NEUTRAL_SKILL_SCORE = 50


class MatchScorer:
    def __init__(self, cfg: Config, profile: Profile):
        self.cfg = cfg
        self.profile = profile
        self.location_filter = LocationFilter(cfg)
        self.profile_skills = {s.lower() for s in profile.all_skills()}
        self.weights = {**WEIGHTS, **(cfg.get("matching.weights", {}) or {})}
        self.neutral_skill_score = int(
            cfg.get("matching.min_neutral_skill_score", DEFAULT_NEUTRAL_SKILL_SCORE)
        )

    # ── component scores ──────────────────────────────────────────────────────

    def _skills(self, job: Job) -> tuple[int, list[str], list[str]]:
        """Score skill overlap; return (score, met, gaps)."""
        required = job.skills_detected()
        if not required:
            return self.neutral_skill_score, [], []  # no detectable requirements
        met = [s for s in required if s.lower() in self.profile_skills]
        gaps = [s for s in required if s.lower() not in self.profile_skills]
        score = round(100 * len(met) / len(required))
        return score, met, gaps

    def _experience(self, job: Job) -> int:
        """Score based on title alignment and years of history available."""
        title_words = set(job.title.lower().replace("/", " ").split())
        role_hit = 0
        for role in self.cfg.target_roles:
            if title_words & set(role.lower().split()):
                role_hit = 1
                break
        history_depth = min(len(self.profile.work_history), 4) / 4  # 0..1
        # 60% title alignment, 40% depth of relevant history.
        return round(100 * (0.6 * role_hit + 0.4 * history_depth))

    def _growth(self, job: Job) -> int:
        """Reward roles that represent a step up or a target specialisation."""
        text = f"{job.title} {job.description}".lower()
        senior_markers = ("senior", "lead", "analyst", "engineer", "administrator", "specialist")
        growth_markers = ("career", "progression", "training", "certification", "development", "mentor")
        score = 50
        if any(m in job.title.lower() for m in senior_markers):
            score += 25
        if any(m in text for m in growth_markers):
            score += 25
        return min(score, 100)

    # ── public API ────────────────────────────────────────────────────────────

    def score(self, job: Job) -> Job:
        match = self.location_filter.classify(job)
        location_score = self.location_filter.score(match)
        skills_score, met, gaps = self._skills(job)
        experience_score = self._experience(job)
        growth_score = self._growth(job)

        overall = round(
            self.weights["skills"] * skills_score
            + self.weights["experience"] * experience_score
            + self.weights["location"] * location_score
            + self.weights["growth"] * growth_score
        )

        job.skills_score = skills_score
        job.experience_score = experience_score
        job.location_score = location_score
        job.growth_score = growth_score
        job.overall_score = overall
        job.requirements_met = met
        job.gaps = gaps
        job.fit_reason = self._explain(job, match, met, gaps)
        job.recommendation = self._recommend(job, match)
        return job

    def _explain(self, job: Job, match: LocationMatch, met: list[str], gaps: list[str]) -> str:
        bits = []
        if met:
            bits.append(f"You match {len(met)} key requirement(s): {', '.join(met[:6])}.")
        else:
            bits.append("Few directly matching keywords were detected in your profile.")
        word = match.value.lower()
        article = "an" if word[0] in "aeiou" else "a"
        bits.append(f"Location is {article} {word} fit ({job.location}).")
        if job.remote:
            bits.append("Role is remote.")
        elif job.hybrid:
            bits.append("Role is hybrid.")
        if gaps:
            bits.append(f"Possible gaps to address: {', '.join(gaps[:6])}.")
        return " ".join(bits)

    def _recommend(self, job: Job, match: LocationMatch) -> str:
        if match == LocationMatch.POOR:
            return "Skip — outside preferred locations unless exceptional."
        if job.overall_score >= 80:
            return "Strong match — apply with a tailored resume and cover letter."
        if job.overall_score >= self.cfg.min_match_score:
            return "Worth applying — close some gaps in your tailored documents."
        return "Borderline — only apply if you're particularly interested."
