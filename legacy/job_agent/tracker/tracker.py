"""Application tracker.

Thin orchestration over the database to record and advance applications through
their lifecycle: Found → Preparing → Applied → Interview → Rejected / Offer.
"""

from __future__ import annotations

from datetime import date

from ..db import Database
from ..models import Application, ApplicationStatus, Job

VALID_STATUSES = {s.value for s in ApplicationStatus}


class Tracker:
    def __init__(self, db: Database):
        self.db = db

    def register(self, job: Job) -> Application:
        """Ensure an application row exists for a job (status Found)."""
        existing = self.db.get_application_for_job(job.db_id)
        if existing:
            return existing
        app = Application(
            job_id=job.db_id,
            company=job.company,
            role=job.title,
            location=job.location,
            match_score=job.overall_score,
            status=ApplicationStatus.FOUND.value,
        )
        app.db_id = self.db.upsert_application(app)
        return app

    def attach_documents(self, job: Job, resume_path: str, cover_path: str) -> Application:
        app = self.register(job)
        app.resume_path = resume_path
        app.cover_letter_path = cover_path
        app.status = ApplicationStatus.PREPARING.value
        self.db.upsert_application(app)
        return app

    def set_status(self, job_id: int, status: str, *, note: str = "") -> Application:
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{status}'. One of: {sorted(VALID_STATUSES)}")
        app = self.db.get_application_for_job(job_id)
        if not app:
            raise ValueError(f"No application tracked for job {job_id}.")
        app.status = status
        if status == ApplicationStatus.APPLIED.value and not app.date_applied:
            app.date_applied = date.today().isoformat()
        if status in (ApplicationStatus.INTERVIEW.value, ApplicationStatus.OFFER.value):
            app.got_response = True
        if note:
            app.notes = (app.notes + "\n" + note).strip() if app.notes else note
        self.db.upsert_application(app)
        return app

    def all(self) -> list[Application]:
        return self.db.list_applications()
