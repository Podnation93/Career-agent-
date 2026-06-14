"""LLM-assisted semantic helpers.

These augment the deterministic engine when a real AI provider (Ollama/Claude)
is configured. Every function returns ``None`` on any failure — unavailable
provider, network error, or unparseable output — so callers always fall back to
the deterministic result. The numeric match score is still computed by the
deterministic formula; the LLM only refines *which* skills count as met (handling
synonyms/equivalent experience) and adds qualitative resume feedback.
"""

from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from . import AIProvider
    from ..models import Job

logger = logging.getLogger(__name__)

_JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)
_JSON_ARR_RE = re.compile(r"\[.*\]", re.DOTALL)


def _extract(pattern: re.Pattern[str], text: str):
    """Pull the first JSON object/array out of a model response, defensively."""
    m = pattern.search(text or "")
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except (json.JSONDecodeError, ValueError):
        return None


def match_skills(
    provider: "AIProvider",
    candidate_skills: list[str],
    required_skills: list[str],
) -> dict | None:
    """Ask the LLM which required skills the candidate plausibly satisfies.

    Returns ``{"met": [...], "gaps": [...]}`` (each a subset of
    ``required_skills``) or ``None`` to fall back to keyword matching.
    """
    if not required_skills:
        return None
    prompt = (
        "Decide which of the job's required skills the candidate plausibly has, "
        "accounting for synonyms and equivalent experience. Be strict: only count "
        "a requirement as met if the candidate genuinely demonstrates it.\n\n"
        f"Candidate skills: {', '.join(candidate_skills) or '(none)'}\n"
        f"Job required skills: {', '.join(required_skills)}\n\n"
        'Respond with ONLY JSON: {"met": [...], "gaps": [...]} using the exact '
        "job skill strings, every required skill in exactly one list."
    )
    raw = provider.generate(
        prompt,
        system="You assess skill matches for recruiting. Respond only with JSON.",
        max_tokens=400,
    )
    data = _extract(_JSON_OBJ_RE, raw or "")
    if not isinstance(data, dict):
        return None

    allowed = {s.lower(): s for s in required_skills}
    met = [allowed[s.lower()] for s in data.get("met", [])
           if isinstance(s, str) and s.lower() in allowed]
    met_set = {s.lower() for s in met}
    # Anything required but not matched is a gap (don't trust the model's gap list).
    gaps = [s for s in required_skills if s.lower() not in met_set]
    return {"met": list(dict.fromkeys(met)), "gaps": gaps}


def resume_feedback(
    provider: "AIProvider",
    resume_text: str,
    job: "Job",
    limit: int = 5,
) -> list[str] | None:
    """Ask the LLM for concrete resume-improvement suggestions, or ``None``."""
    prompt = (
        "Give short, concrete, actionable suggestions to improve this resume for "
        "the target job and ATS parsing. No fluff, no praise. Do not invent "
        "experience.\n\n"
        f"=== JOB ===\n{job.title} at {job.company}\n{job.description}\n\n"
        f"=== RESUME ===\n{resume_text}\n\n"
        f"Respond with ONLY a JSON array of up to {limit} short strings."
    )
    raw = provider.generate(
        prompt,
        system="You are an expert resume reviewer. Respond only with a JSON array.",
        max_tokens=500,
    )
    data = _extract(_JSON_ARR_RE, raw or "")
    if not isinstance(data, list):
        return None
    out = [s.strip() for s in data if isinstance(s, str) and s.strip()]
    return out[:limit] or None
