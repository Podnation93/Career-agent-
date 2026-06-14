"""Search adapter interface and registry.

Each job board is wrapped in a ``SearchAdapter`` that yields :class:`Job`
objects for a set of target roles. The bundled ``sample`` adapter ships realistic
example data so the entire pipeline runs without network access. Real adapters
(seek / linkedin / indeed) are scaffolds documenting where to plug in a compliant
data source — see each module for details on Terms-of-Service considerations.
"""

from __future__ import annotations

import inspect
from typing import Protocol

from ..config import Config
from ..models import Job


class SearchAdapter(Protocol):
    name: str

    def search(self, roles: list[str], limit: int) -> list[Job]:
        ...


def _instantiate(cls: type, cfg: Config | None):
    """Construct an adapter, injecting ``cfg`` only if its __init__ accepts it.

    Keeps the stateless scaffolds (Sample/Seek/...) zero-arg while letting
    config-driven adapters (RSS) receive config instead of loading it themselves.
    """
    params = inspect.signature(cls.__init__).parameters
    if "cfg" in params:
        return cls(cfg=cfg)
    return cls()


def get_adapters(cfg: Config | None, names: list[str]) -> list[SearchAdapter]:
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
            adapters.append(_instantiate(cls, cfg))
    return adapters
