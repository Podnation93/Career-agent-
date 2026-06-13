"""High-level orchestration tying the modules together.

The :class:`JobAgent` is the single entry point used by both the CLI and the web
dashboard. It owns the config, database and AI provider and exposes the core
workflows: import profile, search & score, tailor documents, track and report.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from .ai import get_provider
from .analytics import Analytics
from .automation import ApplicationAutomator, PreparedApplication
from .config import Config, load_config
from .db import Database
from .matching import MatchScorer
from .models import ApplicationStatus, Job, Profile
from .optimiser import CoverLetterGenerator, ResumeOptimiser, to_html
from .optimiser.ats import AtsReport, ats_report
from .integrations import build_email_message, open_in_thunderbird, save_eml
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


def _format_ats(ats) -> str:
    lines = [
        f"ATS Score: {ats.score}/100",
        f"Keyword coverage: {round(ats.keyword_coverage * 100)}%",
        f"Matched: {', '.join(ats.matched_keywords) or '—'}",
        f"Missing: {', '.join(ats.missing_keywords) or '—'}",
        f"Sections present: {', '.join(ats.present_sections) or '—'}",
        f"Word count: {ats.word_count}",
        "",
        "Suggestions:",
    ]
    lines += [f"  • {s}" for s in ats.suggestions]
    return "\n".join(lines) + "\n"


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

        # Print/PDF-ready HTML versions (open in a browser → Save as PDF).
        resume_html = out_dir / "resume.html"
        cover_html = out_dir / "cover_letter.html"
        resume_html.write_text(to_html(resume, f"{job.title} — Resume"), encoding="utf-8")
        cover_html.write_text(to_html(cover_full, f"{job.title} — Cover Letter"), encoding="utf-8")

        # ATS scoring of the tailored resume, written alongside the docs.
        ats = ats_report(resume, job)
        ats_path = out_dir / "ats_report.txt"
        ats_path.write_text(_format_ats(ats), encoding="utf-8")

        self.tracker.attach_documents(job, str(resume_path), str(cover_path))
        return {
            "resume": str(resume_path),
            "cover_letter": str(cover_path),
            "cover_letter_short": str(short_path),
            "resume_html": str(resume_html),
            "cover_letter_html": str(cover_html),
            "ats_report": str(ats_path),
            "ats_score": str(ats.score),
            "dir": str(out_dir),
        }

    def ats_for(self, job_id: int) -> AtsReport:
        """Compute the ATS report for an already-tailored job's resume."""
        app = self.db.get_application_for_job(job_id)
        if not app or not app.resume_path or not Path(app.resume_path).exists():
            self.tailor(job_id)
            app = self.db.get_application_for_job(job_id)
        job = self.db.get_job(job_id)
        return ats_report(Path(app.resume_path).read_text(encoding="utf-8"), job)

    # ── daily run ────────────────────────────────────────────────────────────

    def daily(self, top_n: int = 3, report_limit: int = 10) -> dict:
        """End-to-end daily pass: search, tailor the top matches, build report.

        Returns the report text plus, for each of the top ``top_n`` qualifying
        jobs, its tailored documents and ATS score.
        """
        self.search()
        report = self.daily_report(limit=report_limit)
        top = self.top_jobs(limit=top_n)
        tailored = []
        for job in top:
            paths = self.tailor(job.db_id)
            tailored.append({
                "job_id": job.db_id,
                "title": job.title,
                "company": job.company,
                "match_score": job.overall_score,
                "ats_score": int(paths["ats_score"]),
                "dir": paths["dir"],
            })
        return {"report": report, "tailored": tailored}

    # ── email draft (never auto-sent) ──────────────────────────────────────────

    def email_draft(self, job_id: int, *, to: str = "", open_thunderbird: bool = False) -> dict:
        """Build a .eml application draft (Thunderbird-ready). Never sends."""
        profile = self.require_profile()
        app = self.db.get_application_for_job(job_id)
        if not app or not app.resume_path or not Path(app.resume_path).exists():
            self.tailor(job_id)
            app = self.db.get_application_for_job(job_id)
        job = self.db.get_job(job_id)

        short_path = Path(app.resume_path).parent / "cover_letter_short.txt"
        body = short_path.read_text(encoding="utf-8") if short_path.exists() else ""
        subject = f"Application — {job.title}" + (f" ({profile.name})" if profile.name else "")
        attachments = [app.resume_path, app.cover_letter_path]

        msg = build_email_message(
            sender=profile.email, subject=subject, body=body, to=to,
            attachments=attachments,
        )
        eml_path = Path(app.resume_path).parent / "application.eml"
        save_eml(msg, eml_path)

        launched = False
        if open_thunderbird:
            launched = open_in_thunderbird(
                subject=subject, body=body, to=to, attachments=attachments,
            )
        return {
            "eml": str(eml_path),
            "subject": subject,
            "to": to,
            "thunderbird_launched": launched,
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

    # ── approval-gated apply ────────────────────────────────────────────────────
    #
    # The agent never sends or submits on its own. ``request_apply`` prepares a
    # complete application and parks it in the AwaitingApproval state with a
    # ``pending`` plan; nothing leaves until ``approve_apply`` is called (which a
    # human triggers — e.g. by accepting the phone push the agent sends).

    def request_apply(self, job_id: int, *, via: str = "email", to: str = "") -> dict:
        """Prepare an application and queue it for approval. Sends nothing."""
        if via not in ("email", "web"):
            raise ValueError("via must be 'email' or 'web'.")
        job = self.db.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")
        self.tailor(job_id)  # ensure fresh documents + ATS
        app = self.db.get_application_for_job(job_id)

        plan = {
            "via": via, "to": to, "job_id": job_id,
            "title": job.title, "company": job.company, "location": job.location,
            "resume": app.resume_path, "cover_letter": app.cover_letter_path,
        }
        if via == "email":
            draft = self.email_draft(job_id, to=to, open_thunderbird=False)
            plan["eml"] = draft["eml"]
            plan["subject"] = draft["subject"]
        else:  # web
            plan["url"] = job.url

        app.pending = json.dumps(plan)
        app.status = ApplicationStatus.AWAITING_APPROVAL.value
        self.db.upsert_application(app)
        return plan

    def pending_approvals(self) -> list[dict]:
        """All applications currently awaiting your approval, with their plans."""
        out = []
        for a in self.tracker.all():
            if a.status == ApplicationStatus.AWAITING_APPROVAL.value and a.pending:
                out.append(json.loads(a.pending))
        return out

    def approve_apply(self, job_id: int, *, open_thunderbird: bool = True) -> dict:
        """Execute a queued application after approval. For email this opens a
        Thunderbird compose window for you to send; the agent still never sends."""
        app = self.db.get_application_for_job(job_id)
        if not app or app.status != ApplicationStatus.AWAITING_APPROVAL.value or not app.pending:
            raise ValueError(f"No application awaiting approval for job {job_id}.")
        plan = json.loads(app.pending)
        result = {"via": plan.get("via"), "job_id": job_id}

        if plan.get("via") == "email":
            short = Path(app.resume_path).parent / "cover_letter_short.txt"
            body = short.read_text(encoding="utf-8") if short.exists() else ""
            launched = False
            if open_thunderbird:
                launched = open_in_thunderbird(
                    subject=plan.get("subject", ""), body=body, to=plan.get("to", ""),
                    attachments=[app.resume_path, app.cover_letter_path],
                )
            result["thunderbird_launched"] = launched
            result["eml"] = plan.get("eml")
        else:  # web — hand the prepared application to the browser automator
            result["url"] = plan.get("url")
            result["instructions"] = self.prepare_application(job_id).instructions

        app.pending = ""
        app.status = ApplicationStatus.APPLIED.value
        app.date_applied = date.today().isoformat()
        self.db.upsert_application(app)
        return result

    def reject_apply(self, job_id: int, reason: str = "") -> None:
        """Cancel a queued application; it returns to the Preparing state."""
        app = self.db.get_application_for_job(job_id)
        if not app or app.status != ApplicationStatus.AWAITING_APPROVAL.value:
            raise ValueError(f"No application awaiting approval for job {job_id}.")
        app.pending = ""
        app.status = ApplicationStatus.PREPARING.value
        if reason:
            app.notes = (app.notes + "\n" + reason).strip() if app.notes else reason
        self.db.upsert_application(app)

    # ── tracker & analytics ──────────────────────────────────────────────────

    def set_status(self, job_id: int, status: str, note: str = ""):
        return self.tracker.set_status(job_id, status, note=note)

    def analytics(self):
        return Analytics(self.db).compute()
