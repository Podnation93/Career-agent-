"""SQLite persistence layer.

Stores the candidate profile, discovered jobs and the application tracker. We use
the standard-library ``sqlite3`` module so there are no extra dependencies; the
schema is intentionally simple and JSON is used for list-valued fields.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .models import (
    Application,
    Job,
    Profile,
    WorkExperience,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    description TEXT,
    url TEXT,
    salary TEXT,
    remote INTEGER DEFAULT 0,
    hybrid INTEGER DEFAULT 0,
    posted TEXT,
    location_match TEXT,
    skills_score INTEGER DEFAULT 0,
    experience_score INTEGER DEFAULT 0,
    location_score INTEGER DEFAULT 0,
    growth_score INTEGER DEFAULT 0,
    overall_score INTEGER DEFAULT 0,
    fit_reason TEXT,
    requirements_met TEXT,
    gaps TEXT,
    recommendation TEXT,
    UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    company TEXT,
    role TEXT,
    location TEXT,
    match_score INTEGER,
    status TEXT,
    resume_path TEXT,
    cover_letter_path TEXT,
    date_applied TEXT,
    notes TEXT,
    got_response INTEGER DEFAULT 0,
    pending TEXT DEFAULT '',
    created_at TEXT,
    FOREIGN KEY(job_id) REFERENCES jobs(id)
);
"""

_LIST_FIELDS = ("requirements_met", "gaps")


class Database:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def init_schema(self) -> None:
        self.conn.executescript(SCHEMA)
        self._migrate()
        self.conn.commit()

    def _migrate(self) -> None:
        """Add columns introduced after a database was first created."""
        cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(applications)")}
        if "pending" not in cols:
            self.conn.execute("ALTER TABLE applications ADD COLUMN pending TEXT DEFAULT ''")

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ── Profile ──────────────────────────────────────────────────────────────

    def save_profile(self, profile: Profile) -> None:
        payload = json.dumps(profile.to_dict())
        self.conn.execute(
            "INSERT INTO profile (id, data) VALUES (1, ?) "
            "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            (payload,),
        )
        self.conn.commit()

    def load_profile(self) -> Profile | None:
        row = self.conn.execute("SELECT data FROM profile WHERE id = 1").fetchone()
        if not row:
            return None
        data = json.loads(row["data"])
        work = [WorkExperience(**w) for w in data.pop("work_history", [])]
        return Profile(work_history=work, **data)

    # ── Jobs ─────────────────────────────────────────────────────────────────

    def upsert_job(self, job: Job) -> int:
        cols = [
            "source", "external_id", "title", "company", "location", "description",
            "url", "salary", "remote", "hybrid", "posted", "location_match",
            "skills_score", "experience_score", "location_score", "growth_score",
            "overall_score", "fit_reason", "requirements_met", "gaps", "recommendation",
        ]
        values = []
        for c in cols:
            v = getattr(job, c)
            if c in _LIST_FIELDS:
                v = json.dumps(v)
            elif isinstance(v, bool):
                v = int(v)
            values.append(v)
        placeholders = ", ".join("?" for _ in cols)
        updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c not in ("source", "external_id"))
        cur = self.conn.execute(
            f"INSERT INTO jobs ({', '.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT(source, external_id) DO UPDATE SET {updates}",
            values,
        )
        self.conn.commit()
        if cur.lastrowid:
            row = self.conn.execute(
                "SELECT id FROM jobs WHERE source=? AND external_id=?",
                (job.source, job.external_id),
            ).fetchone()
            return row["id"]
        return cur.lastrowid

    def _row_to_job(self, row: sqlite3.Row) -> Job:
        d = dict(row)
        d["db_id"] = d.pop("id")
        d["remote"] = bool(d["remote"])
        d["hybrid"] = bool(d["hybrid"])
        for f in _LIST_FIELDS:
            d[f] = json.loads(d[f]) if d.get(f) else []
        return Job(**d)

    def get_job(self, job_id: int) -> Job | None:
        row = self.conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._row_to_job(row) if row else None

    def list_jobs(self, min_score: int = 0, limit: int = 50) -> list[Job]:
        rows = self.conn.execute(
            "SELECT * FROM jobs WHERE overall_score >= ? "
            "ORDER BY overall_score DESC, id DESC LIMIT ?",
            (min_score, limit),
        ).fetchall()
        return [self._row_to_job(r) for r in rows]

    # ── Applications ───────────────────────────────────────────────────────

    def upsert_application(self, app: Application) -> int:
        if app.db_id:
            self.conn.execute(
                "UPDATE applications SET status=?, resume_path=?, cover_letter_path=?, "
                "date_applied=?, notes=?, got_response=?, pending=?, match_score=? WHERE id=?",
                (app.status, app.resume_path, app.cover_letter_path, app.date_applied,
                 app.notes, int(app.got_response), app.pending, app.match_score, app.db_id),
            )
            self.conn.commit()
            return app.db_id
        # one application per job
        existing = self.conn.execute(
            "SELECT id FROM applications WHERE job_id = ?", (app.job_id,)
        ).fetchone()
        if existing:
            app.db_id = existing["id"]
            return self.upsert_application(app)
        cur = self.conn.execute(
            "INSERT INTO applications (job_id, company, role, location, match_score, "
            "status, resume_path, cover_letter_path, date_applied, notes, got_response, "
            "pending, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (app.job_id, app.company, app.role, app.location, app.match_score, app.status,
             app.resume_path, app.cover_letter_path, app.date_applied, app.notes,
             int(app.got_response), app.pending, app.created_at),
        )
        self.conn.commit()
        return cur.lastrowid

    def _row_to_app(self, row: sqlite3.Row) -> Application:
        d = dict(row)
        d["db_id"] = d.pop("id")
        d["got_response"] = bool(d["got_response"])
        d["pending"] = d.get("pending") or ""
        return Application(**d)

    def get_application_for_job(self, job_id: int) -> Application | None:
        row = self.conn.execute(
            "SELECT * FROM applications WHERE job_id = ?", (job_id,)
        ).fetchone()
        return self._row_to_app(row) if row else None

    def list_applications(self) -> list[Application]:
        rows = self.conn.execute(
            "SELECT * FROM applications ORDER BY created_at DESC"
        ).fetchall()
        return [self._row_to_app(r) for r in rows]
