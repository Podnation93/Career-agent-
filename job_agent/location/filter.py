"""Location filter.

Classifies each job's location as Excellent / Good / Poor relative to the
candidate's preferred areas (Western Melbourne, Melbourne CBD, Richmond) and
honours remote / hybrid / CBD-travel acceptance rules from ``config.yaml``.
"""

from __future__ import annotations

from ..config import Config
from ..models import Job, LocationMatch

# Words in a job's location/description that indicate remote or hybrid work.
_REMOTE_HINTS = ("remote", "work from home", "wfh", "anywhere")
_HYBRID_HINTS = ("hybrid", "flexible work", "2 days in office", "3 days in office")

# Negations that flip a hint match off, e.g. "no remote option", "office only".
_NEGATIONS = ("no remote", "not remote", "non-remote", "no wfh", "no hybrid",
              "office only", "on-site only", "onsite only", "fully on-site")


def _mentions(haystack: str, hints: tuple[str, ...]) -> bool:
    """True if a hint is present and not negated."""
    if any(neg in haystack for neg in _NEGATIONS):
        return False
    return any(h in haystack for h in hints)


class LocationFilter:
    def __init__(self, cfg: Config):
        loc = cfg.get("locations", {}) or {}
        self.accept_remote = bool(loc.get("accept_remote", True))
        self.accept_hybrid = bool(loc.get("accept_hybrid", True))
        self.accept_cbd_travel = bool(loc.get("accept_cbd_travel", True))

        regions = loc.get("regions", {}) or {}
        self.excellent_suburbs = {
            s.lower() for suburbs in regions.values() for s in suburbs
        }
        self.good_suburbs = {s.lower() for s in (loc.get("good_suburbs", []) or [])}

    def _detect_work_style(self, job: Job) -> None:
        haystack = f"{job.location} {job.description}".lower()
        if not job.remote and _mentions(haystack, _REMOTE_HINTS):
            job.remote = True
        if not job.hybrid and _mentions(haystack, _HYBRID_HINTS):
            job.hybrid = True

    def classify(self, job: Job) -> LocationMatch:
        """Return the location match level and set ``job.location_match``."""
        self._detect_work_style(job)
        loc = job.location.lower()

        # Remote / hybrid roles satisfy location requirements outright.
        if job.remote and self.accept_remote:
            match = LocationMatch.EXCELLENT
        elif job.hybrid and self.accept_hybrid:
            match = LocationMatch.GOOD
        elif any(suburb in loc for suburb in self.excellent_suburbs):
            match = LocationMatch.EXCELLENT
        elif any(suburb in loc for suburb in self.good_suburbs):
            match = LocationMatch.GOOD
        elif "melbourne" in loc and self.accept_cbd_travel:
            # Somewhere in greater Melbourne but not a preferred suburb.
            match = LocationMatch.GOOD
        else:
            match = LocationMatch.POOR

        job.location_match = match.value
        return match

    def score(self, match: LocationMatch) -> int:
        return {
            LocationMatch.EXCELLENT: 100,
            LocationMatch.GOOD: 70,
            LocationMatch.POOR: 20,
        }[match]

    def accepts(self, job: Job) -> bool:
        """Whether a job passes the hard location gate (not Poor)."""
        return self.classify(job) != LocationMatch.POOR
