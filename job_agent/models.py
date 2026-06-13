"""Core data structures shared across the agent.

These are plain dataclasses so they are easy to serialise to/from the SQLite
database and to pass around between modules without coupling them to a framework.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any


# ── Profile ──────────────────────────────────────────────────────────────────


@dataclass
class WorkExperience:
    """A single role from the candidate's work history."""

    title: str
    company: str = ""
    start: str = ""
    end: str = ""
    responsibilities: list[str] = field(default_factory=list)
    achievements: list[str] = field(default_factory=list)


@dataclass
class Profile:
    """The candidate's professional profile, extracted from their resume.

    Nothing here is ever invented — every field is populated from imported
    documents or from values the candidate explicitly provides.
    """

    name: str = ""
    email: str = ""
    phone: str = ""
    summary: str = ""
    work_history: list[WorkExperience] = field(default_factory=list)
    technical_skills: list[str] = field(default_factory=list)
    soft_skills: list[str] = field(default_factory=list)
    certifications: list[str] = field(default_factory=list)
    education: list[str] = field(default_factory=list)
    projects: list[str] = field(default_factory=list)
    industries: list[str] = field(default_factory=list)
    raw_resume_text: str = ""

    # Cover-letter memory
    cover_letter_style: str = ""
    career_story: str = ""
    motivations: str = ""

    def all_skills(self) -> list[str]:
        return list(dict.fromkeys(self.technical_skills + self.soft_skills))

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Jobs ─────────────────────────────────────────────────────────────────────


class LocationMatch(str, Enum):
    EXCELLENT = "Excellent"
    GOOD = "Good"
    POOR = "Poor"


@dataclass
class Job:
    """A job opportunity discovered by a search adapter."""

    source: str
    external_id: str
    title: str
    company: str
    location: str
    description: str = ""
    url: str = ""
    salary: str = ""
    remote: bool = False
    hybrid: bool = False
    posted: str = ""

    # Populated by the location filter / matching engine.
    location_match: str = LocationMatch.POOR.value
    skills_score: int = 0
    experience_score: int = 0
    location_score: int = 0
    growth_score: int = 0
    overall_score: int = 0
    fit_reason: str = ""
    requirements_met: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    recommendation: str = ""

    db_id: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Applications ─────────────────────────────────────────────────────────────


class ApplicationStatus(str, Enum):
    FOUND = "Found"
    PREPARING = "Preparing"
    AWAITING_APPROVAL = "AwaitingApproval"
    APPLIED = "Applied"
    INTERVIEW = "Interview"
    REJECTED = "Rejected"
    OFFER = "Offer"


@dataclass
class Application:
    """Tracks one application through its lifecycle."""

    job_id: int
    company: str
    role: str
    location: str
    match_score: int
    status: str = ApplicationStatus.FOUND.value
    resume_path: str = ""
    cover_letter_path: str = ""
    date_applied: str = ""
    notes: str = ""
    got_response: bool = False
    # JSON blob describing a prepared-but-not-yet-approved action (channel, to…).
    pending: str = ""
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    db_id: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
