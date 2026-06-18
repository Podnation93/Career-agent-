"""Indeed adapter (scaffold).

Indeed deprecated its open Publisher API and restricts scraping under its Terms
of Service. Plug in a compliant source — e.g. the Indeed employer/partner API if
you have access, an email job alert you parse, or a manual export — and implement
:meth:`search` to return :class:`Job` objects.
"""

from __future__ import annotations

from ..models import Job


class IndeedAdapter:
    name = "indeed"

    def search(self, roles: list[str], limit: int) -> list[Job]:
        return []
