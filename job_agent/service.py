"""High-level orchestration tying the modules together.

The :class:`JobAgent` is the single entry point used by both the CLI and the web
dashboard. It owns the config, database and AI provider and exposes the core
workflows: import profile, search & score, tailor documents, track and report.
"""

from __future__ import annotations

from pathlib import Path

from .ai import get_provider
from .analytics import Analytics
from .automation import ApplicationAutomator, PreparedApplication
from .config import Config, load_config
from .db import Database
from .matching import MatchScorer
from .models import Job, Profile
from .optimiser import CoverLetterGenerator, ResumeOptimiser
from .profile import (
    extract_profile_from_file,
    extract_profile_from_text,
    set_cover_style,
)
from .reports import build_daily_report
from .search import get_adapters
from .tracker import Tracker


def _slug(text: str) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in text]
    s = "".join(keep)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")[:60] or "job"


class JobAgent:
    def __init__(self, cfg: Config | None = None):
        self.cfg = cfg or load_config()
        self.db = Database(self.cfg.database_path)
        self.ai = get_provider(self.cfg)
        self.tracker = Tracker(self.db)

    def close(self) -> None:
        self.db.close()

    # ── setup ──────────────────────────────────────────────────────────────────

    def init(self) -> None:
        self.db.init_schema()
        self.cfg.output_dir.mkdir(parents=True, exist_ok=True)

    # ── profile ────────────────────────────────────────────────────────────────

    def import_resume(self, path: str) -> Profile:
        profile = extract_profile_from_file(path)
        self.db.save_profile(profile)
        return profile

    def import_resume_text(self, text: str) -> Profile:
        profile = extract_profile_from_text(text)
        self.db.save_profile(profile)
        return profile

    def get_profile(self) -> Profile | None:
        return self.db.load_profile()

    def require_profile(self) -> Profile:
        profile = self.get_profile()
        if not profile:
            raise RuntimeError(
                "No profile found. Import your resume first: "
                "`python -m job_agent.cli import-resume <file>`."
            )
        return profile

    def set_cover_style(self, **kwargs) -> Profile:
        profile = self.require_profile()
        set_cover_style(profile, **kwargs)
        self.db.save_profile(profile)
        return profile

    # ── search & match ───────────────────────────────────────────────────────

    def search(self) -> list[Job]:
        profile = self.require_profile()
        scorer = MatchScorer(self.cfg, profile)
        limit = int(self.cfg.get("search.results_per_source", 25))
        adapters = get_adapters(self.cfg.search_sources)

        scored: list[Job] = []
        for adapter in adapters:
            for job in adapter.search(self.cfg.target_roles, limit):
                scorer.score(job)
                job.db_id = self.db.upsert_job(job)
                self.tracker.register(job)
                scored.append(job)
        scored.sort(key=lambda j: j.overall_score, reverse=True)
        return scored

    def top_jobs(self, limit: int = 10) -> list[Job]:
        return self.db.list_jobs(min_score=self.cfg.min_match_score, limit=limit)

    def daily_report(self, limit: int = 10) -> str:
        return build_daily_report(self.cfg, self.db, limit=limit)

    # ── tailoring ──────────────────────────────────────────────────────────────

    def tailor(self, job_id: int) -> dict[str, str]:
        """Generate a tailored resume + both cover letters for a job."""
        profile = self.require_profile()
        job = self.db.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")

        resume = ResumeOptimiser(self.ai, profile).build(job)
        clg = CoverLetterGenerator(self.ai, profile)
        cover_full = clg.full(job)
        cover_short = clg.short(job)

        out_dir = self.cfg.output_dir / f"{job_id}-{_slug(job.company)}-{_slug(job.title)}"
        out_dir.mkdir(parents=True, exist_ok=True)
        resume_path = out_dir / "resume.txt"
        cover_path = out_dir / "cover_letter.txt"
        short_path = out_dir / "cover_letter_short.txt"
        resume_path.write_text(resume, encoding="utf-8")
        cover_path.write_text(cover_full, encoding="utf-8")
        short_path.write_text(cover_short, encoding="utf-8")

        self.tracker.attach_documents(job, str(resume_path), str(cover_path))
        return {
            "resume": str(resume_path),
            "cover_letter": str(cover_path),
            "cover_letter_short": str(short_path),
            "dir": str(out_dir),
        }

    # ── apply (prepare only) ────────────────────────────────────────────────────

    def prepare_application(self, job_id: int, *, headless: bool = False) -> PreparedApplication:
        job = self.db.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")
        app = self.db.get_application_for_job(job_id)
        if not app or not app.resume_path:
            # auto-tailor if documents are missing
            self.tailor(job_id)
            app = self.db.get_application_for_job(job_id)
        return ApplicationAutomator(headless=headless).prepare(job, app)

    # ── tracker & analytics ──────────────────────────────────────────────────

    def set_status(self, job_id: int, status: str, note: str = ""):
        return self.tracker.set_status(job_id, status, note=note)

    def analytics(self):
        return Analytics(self.db).compute()
