"""Daily opportunities report.

Renders the best-matching jobs above the configured threshold into a clean,
scannable summary. Only shows jobs worth considering.
"""

from __future__ import annotations

from datetime import date

from ..config import Config
from ..db import Database
from ..models import Job


def _format_job(idx: int, job: Job) -> str:
    return (
        f"{idx}. {job.title} — {job.company}\n"
        f"   Location:    {job.location}  [{job.location_match}]\n"
        f"   Match Score: {job.overall_score}/100 "
        f"(skills {job.skills_score} · exp {job.experience_score} · "
        f"loc {job.location_score} · growth {job.growth_score})\n"
        f"   Salary:      {job.salary or 'Not specified'}\n"
        f"   Why suitable: {job.fit_reason}\n"
        f"   Recommendation: {job.recommendation}\n"
        f"   Link: {job.url or 'n/a'}  (job id: {job.db_id})\n"
    )


def build_daily_report(cfg: Config, db: Database, limit: int = 10) -> str:
    jobs = db.list_jobs(min_score=cfg.min_match_score, limit=limit)
    header = (
        f"JOB OPPORTUNITIES FOUND — {date.today().isoformat()}\n"
        f"{'=' * 52}\n"
        f"Showing matches scoring {cfg.min_match_score}+ around your preferred areas.\n"
    )
    if not jobs:
        return header + "\nNo qualifying opportunities today. Try `search` again later.\n"
    body = "\n".join(_format_job(i, j) for i, j in enumerate(jobs, 1))
    return header + "\n" + body
