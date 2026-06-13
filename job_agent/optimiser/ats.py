"""ATS (Applicant Tracking System) scoring for a tailored resume.

Given a resume's text and the target job, this produces a transparent 0-100 ATS
score plus concrete, actionable suggestions. It checks four things ATS parsers
and recruiters actually care about:

* **Keyword coverage** — how many of the job's detected skills appear in the
  resume (the single biggest ATS factor).
* **Sections** — presence of the standard headings a parser looks for.
* **Contact details** — a parseable email address.
* **Length** — resumes that are too short look thin; too long get skimmed.

It is deterministic and explainable — no black box.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..models import Job
from ..profile import skills as skillset

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_EXPECTED_SECTIONS = {
    "summary": ("summary", "profile", "objective"),
    "skills": ("skills", "competencies"),
    "experience": ("experience", "employment", "work history"),
    "education": ("education", "qualifications"),
}

# Component weights (sum to 100).
_W_KEYWORDS = 60
_W_SECTIONS = 25
_W_CONTACT = 5
_W_LENGTH = 10

# Ideal resume length window (words).
_MIN_WORDS = 200
_MAX_WORDS = 900


@dataclass
class AtsReport:
    score: int = 0
    keyword_coverage: float = 0.0
    matched_keywords: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)
    present_sections: list[str] = field(default_factory=list)
    missing_sections: list[str] = field(default_factory=list)
    word_count: int = 0
    has_contact: bool = False
    suggestions: list[str] = field(default_factory=list)


def _job_keywords(job: Job) -> list[str]:
    kws = skillset.find_technical_skills(job.description) + \
        skillset.find_soft_skills(job.description)
    return list(dict.fromkeys(kws))


def ats_report(resume_text: str, job: Job) -> AtsReport:
    low = resume_text.lower()
    report = AtsReport(word_count=len(resume_text.split()))

    # 1. Keyword coverage
    keywords = _job_keywords(job)
    if keywords:
        matched = [k for k in keywords if k.lower() in low]
        report.matched_keywords = matched
        report.missing_keywords = [k for k in keywords if k.lower() not in low]
        report.keyword_coverage = len(matched) / len(keywords)
        kw_score = _W_KEYWORDS * report.keyword_coverage
    else:
        report.keyword_coverage = 1.0
        kw_score = _W_KEYWORDS

    # 2. Sections
    for name, aliases in _EXPECTED_SECTIONS.items():
        if any(a in low for a in aliases):
            report.present_sections.append(name)
        else:
            report.missing_sections.append(name)
    sec_score = _W_SECTIONS * len(report.present_sections) / len(_EXPECTED_SECTIONS)

    # 3. Contact
    report.has_contact = bool(_EMAIL_RE.search(resume_text))
    contact_score = _W_CONTACT if report.has_contact else 0

    # 4. Length
    if _MIN_WORDS <= report.word_count <= _MAX_WORDS:
        length_score = _W_LENGTH
    elif report.word_count < _MIN_WORDS:
        length_score = _W_LENGTH * report.word_count / _MIN_WORDS
    else:  # too long
        length_score = _W_LENGTH * max(0.3, _MAX_WORDS / report.word_count)

    report.score = round(kw_score + sec_score + contact_score + length_score)
    report.suggestions = _suggestions(report)
    return report


def _suggestions(r: AtsReport) -> list[str]:
    out: list[str] = []
    if r.missing_keywords:
        out.append(
            "Surface these job keywords (only if you genuinely have them): "
            + ", ".join(r.missing_keywords[:8])
        )
    if r.missing_sections:
        out.append("Add clearly-labelled sections: " + ", ".join(r.missing_sections))
    if not r.has_contact:
        out.append("Add a parseable email address near the top.")
    if r.word_count < _MIN_WORDS:
        out.append(f"Resume is short ({r.word_count} words); add detail to reach ~{_MIN_WORDS}+.")
    elif r.word_count > _MAX_WORDS:
        out.append(f"Resume is long ({r.word_count} words); trim toward ~{_MAX_WORDS}.")
    if not out:
        out.append("Looks ATS-ready — strong keyword coverage and structure.")
    return out
