"""Resume import and extraction.

Reads a resume from PDF, DOCX, TXT or JSON and extracts a structured
:class:`~job_agent.models.Profile`. Extraction is deliberately conservative — it
only records what is present in the document. It never fabricates experience.

If a JSON file is supplied it is treated as an authoritative profile dump (the
fields map directly to ``Profile``), which is the most reliable path.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ..models import Profile, WorkExperience
from . import skills as skillset

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")

# Heading keywords used to segment a plain-text resume into sections.
SECTION_HEADINGS = {
    "summary": ["summary", "profile", "objective", "about me"],
    "experience": ["experience", "employment", "work history", "career history"],
    "skills": ["skills", "technical skills", "competencies"],
    "education": ["education", "qualifications", "academic"],
    "certifications": ["certifications", "certificates", "licences", "licenses"],
    "projects": ["projects", "portfolio"],
}


def read_text(path: Path) -> str:
    """Extract raw text from a resume file."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _read_pdf(path)
    if suffix in (".docx", ".doc"):
        return _read_docx(path)
    return path.read_text(encoding="utf-8", errors="ignore")


def _read_pdf(path: Path) -> str:
    try:
        import pdfplumber
    except ImportError as exc:  # pragma: no cover - dependency guidance
        raise RuntimeError(
            "Reading PDF resumes requires 'pdfplumber'. Install it with "
            "`pip install pdfplumber`, or export your resume to TXT/JSON."
        ) from exc
    parts = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _read_docx(path: Path) -> str:
    try:
        import docx
    except ImportError as exc:  # pragma: no cover - dependency guidance
        raise RuntimeError(
            "Reading DOCX resumes requires 'python-docx'. Install it with "
            "`pip install python-docx`, or export your resume to TXT/JSON."
        ) from exc
    document = docx.Document(str(path))
    return "\n".join(p.text for p in document.paragraphs)


def _split_sections(text: str) -> dict[str, str]:
    """Group resume lines under detected section headings."""
    sections: dict[str, list[str]] = {key: [] for key in SECTION_HEADINGS}
    sections["_preamble"] = []
    current = "_preamble"
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        low = line.lower().rstrip(":").strip()
        matched = None
        # A heading is a short line that equals/starts with a known keyword.
        if len(low) <= 40:
            for key, keywords in SECTION_HEADINGS.items():
                if any(low == kw or low.startswith(kw) for kw in keywords):
                    matched = key
                    break
        if matched:
            current = matched
        else:
            sections.setdefault(current, []).append(line)
    return {k: "\n".join(v) for k, v in sections.items()}


def _extract_work_history(experience_text: str) -> list[WorkExperience]:
    """Best-effort parse of an experience section into roles.

    A new role is assumed to start on a line that contains a date range. Bullet
    lines (•, -, *) underneath become responsibilities.
    """
    date_range = re.compile(
        r"(19|20)\d{2}.*?(present|current|(19|20)\d{2})", re.IGNORECASE
    )
    roles: list[WorkExperience] = []
    current: WorkExperience | None = None
    for line in experience_text.splitlines():
        stripped = line.strip()
        is_bullet = stripped[:1] in "•-*▪"
        if date_range.search(stripped) and not is_bullet:
            if current:
                roles.append(current)
            # Heuristic: "Title — Company  2019-2022" or "Title, Company"
            head = date_range.split(stripped)[0].strip(" ,—-|")
            title, _, company = head.partition(",")
            if not company:
                title, _, company = head.partition(" at ")
            if not company:
                title, _, company = head.partition("—")
            current = WorkExperience(
                title=title.strip() or head, company=company.strip(),
                start="", end="",
            )
            # capture the date range text
            m = date_range.search(stripped)
            if m:
                current.start = m.group(0)
        elif current and is_bullet:
            current.responsibilities.append(stripped.lstrip("•-*▪ ").strip())
        elif current and not current.responsibilities and stripped:
            # a non-bullet line right after a title is often the company
            if not current.company:
                current.company = stripped
    if current:
        roles.append(current)
    return roles


def _bullet_list(text: str) -> list[str]:
    items = []
    for line in text.splitlines():
        s = line.strip().lstrip("•-*▪ ").strip()
        if s:
            items.append(s)
    return items


def extract_profile_from_text(text: str) -> Profile:
    """Parse raw resume text into a structured profile (no fabrication)."""
    profile = Profile(raw_resume_text=text)

    email = EMAIL_RE.search(text)
    if email:
        profile.email = email.group(0)
    phone = PHONE_RE.search(text)
    if phone:
        profile.phone = phone.group(1).strip()

    sections = _split_sections(text)

    # Name: first non-empty preamble line that isn't contact info.
    for line in sections.get("_preamble", "").splitlines():
        if line and not EMAIL_RE.search(line) and not PHONE_RE.search(line):
            profile.name = line.strip()
            break

    profile.summary = sections.get("summary", "").strip()
    profile.work_history = _extract_work_history(sections.get("experience", ""))
    profile.education = _bullet_list(sections.get("education", ""))
    profile.projects = _bullet_list(sections.get("projects", ""))

    # Skills & certs are extracted from the whole document for recall.
    profile.technical_skills = skillset.find_technical_skills(text)
    profile.soft_skills = skillset.find_soft_skills(text)
    profile.certifications = skillset.find_certifications(text)

    return profile


def _profile_from_json(data: dict) -> Profile:
    work = [WorkExperience(**w) if isinstance(w, dict) else WorkExperience(title=str(w))
            for w in data.pop("work_history", [])]
    known = {f for f in Profile.__dataclass_fields__ if f != "work_history"}
    filtered = {k: v for k, v in data.items() if k in known}
    return Profile(work_history=work, **filtered)


def extract_profile_from_file(path: str | Path) -> Profile:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Resume file not found: {p}")
    if p.suffix.lower() == ".json":
        return _profile_from_json(json.loads(p.read_text(encoding="utf-8")))
    return extract_profile_from_text(read_text(p))
