"""LinkedIn adapter (scaffold).

LinkedIn's Terms of Service prohibit automated scraping, and the site enforces
this aggressively. Use an authorised path instead, such as the official
LinkedIn Jobs API (partner access), a saved-search alert you parse, or manual
exports. Implement :meth:`search` to return :class:`Job` objects.
"""

from __future__ import annotations

from ..models import Job


class LinkedInAdapter:
    name = "linkedin"

    def search(self, roles: list[str], limit: int) -> list[Job]:
        return []
