"""Search adapter interface and registry.

Each job board is wrapped in a ``SearchAdapter`` that yields :class:`Job`
objects for a set of target roles. The bundled ``sample`` adapter ships realistic
example data so the entire pipeline runs without network access. Real adapters
(seek / linkedin / indeed) are scaffolds documenting where to plug in a compliant
data source — see each module for details on Terms-of-Service considerations.
"""

from __future__ import annotations

from typing import Protocol

from ..models import Job


class SearchAdapter(Protocol):
    name: str

    def search(self, roles: list[str], limit: int) -> list[Job]:
        ...


def get_adapters(names: list[str]) -> list[SearchAdapter]:
    """Resolve adapter names from config into adapter instances."""
    from .sample import SampleAdapter
    from .seek import SeekAdapter
    from .linkedin import LinkedInAdapter
    from .indeed import IndeedAdapter
    from .rss import RSSAdapter

    registry: dict[str, type[SearchAdapter]] = {
        "sample": SampleAdapter,
        "rss": RSSAdapter,
        "seek": SeekAdapter,
        "linkedin": LinkedInAdapter,
        "indeed": IndeedAdapter,
    }
    adapters: list[SearchAdapter] = []
    for name in names:
        cls = registry.get(name)
        if cls:
            adapters.append(cls())
    return adapters
