"""Seek.com.au adapter (scaffold).

Seek does not offer a public job-search API for individuals, and scraping the
site programmatically generally violates its Terms of Service and is actively
blocked. This adapter is therefore a **scaffold**: wire it up to a compliant
data source you are entitled to use, for example:

* a saved-search email digest you parse yourself,
* an official partner/employer API if you have access,
* a manual CSV/JSON export.

Implement :meth:`search` to return :class:`Job` objects with at least
``source``, ``external_id``, ``title``, ``company``, ``location``,
``description`` and ``url`` populated. Set ``remote``/``hybrid`` when known.
"""

from __future__ import annotations

from ..models import Job


class SeekAdapter:
    name = "seek"

    def search(self, roles: list[str], limit: int) -> list[Job]:
        # Intentionally returns nothing until a compliant source is configured.
        # See the module docstring for guidance.
        return []
