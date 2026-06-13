"""Generic RSS job-feed adapter.

Many job boards, company career pages and government portals publish jobs as RSS
or Atom feeds — a fully compliant, intended-for-consumption data source (unlike
scraping). This adapter reads feed URLs from ``config.yaml`` and turns each item
into a :class:`Job`.

Configure feeds under::

    search:
      sources: ["sample", "rss"]
      rss_feeds:
        - "https://example.com/jobs.rss"
        - "https://careers.example.gov.au/feed"

It uses ``httpx`` if available, otherwise falls back to the standard library, and
parses with the standard-library XML parser (no extra dependencies). Network or
parse failures degrade gracefully to an empty result.
"""

from __future__ import annotations

import html
import re
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from ..config import load_config
from ..models import Job

_TAG_RE = re.compile(r"<[^>]+>")
# Suburb/state hints we try to lift out of free text for the location field.
_LOCATION_RE = re.compile(
    r"\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?),?\s+(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b"
)


def _strip_html(text: str) -> str:
    return html.unescape(_TAG_RE.sub(" ", text or "")).strip()


def _fetch(url: str, timeout: float = 20.0) -> str | None:
    try:
        import httpx

        resp = httpx.get(url, timeout=timeout, follow_redirects=True,
                         headers={"User-Agent": "job-agent/0.1 (+rss)"})
        resp.raise_for_status()
        return resp.text
    except ImportError:
        pass
    except Exception:
        return None
    try:
        req = Request(url, headers={"User-Agent": "job-agent/0.1 (+rss)"})
        with urlopen(req, timeout=timeout) as fh:  # noqa: S310 - user-configured feed
            return fh.read().decode("utf-8", errors="ignore")
    except Exception:
        return None


def _text(node: ET.Element | None) -> str:
    return (node.text or "").strip() if node is not None else ""


_TITLE_SEP_RE = re.compile(r"\s+(?:at|@|[-–—|])\s+")


def _split_title(title: str) -> tuple[str, str]:
    """Split feed titles like 'Role at Company' / 'Role - Company' into parts."""
    parts = _TITLE_SEP_RE.split(title, maxsplit=1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return title.strip(), ""


def _guess_location(*texts: str) -> str:
    for t in texts:
        m = _LOCATION_RE.search(t or "")
        if m:
            return f"{m.group(1)}, {m.group(2)}"
    return ""


def parse_feed(content: str, source_url: str = "") -> list[Job]:
    """Parse RSS 2.0 or Atom content into Job objects (pure, testable)."""
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return []

    jobs: list[Job] = []
    # RSS 2.0: channel/item ; Atom: feed/entry (namespaced).
    items = root.findall(".//item")
    is_atom = False
    if not items:
        items = [e for e in root.iter() if e.tag.endswith("}entry") or e.tag == "entry"]
        is_atom = True

    for item in items:
        if is_atom:
            title = _text(item.find("{http://www.w3.org/2005/Atom}title")) or _text(item.find("title"))
            summary = _text(item.find("{http://www.w3.org/2005/Atom}summary")) or \
                _text(item.find("{http://www.w3.org/2005/Atom}content")) or _text(item.find("summary"))
            link_el = item.find("{http://www.w3.org/2005/Atom}link")
            link = link_el.get("href", "") if link_el is not None else _text(item.find("link"))
            guid = _text(item.find("{http://www.w3.org/2005/Atom}id")) or link
            published = _text(item.find("{http://www.w3.org/2005/Atom}updated"))
        else:
            title = _text(item.find("title"))
            summary = _text(item.find("description"))
            link = _text(item.find("link"))
            guid = _text(item.find("guid")) or link
            published = _text(item.find("pubDate"))

        if not title:
            continue
        description = _strip_html(summary)
        role, company = _split_title(title)
        location = _guess_location(title, description)

        jobs.append(Job(
            source="rss",
            external_id=guid or link or title,
            title=(role or title).strip(),
            company=(company or "").strip(),
            location=location,
            description=description,
            url=link,
            posted=published,
        ))
    return jobs


class RSSAdapter:
    name = "rss"

    def __init__(self, feeds: list[str] | None = None):
        if feeds is None:
            cfg = load_config()
            feeds = cfg.get("search.rss_feeds", []) or []
        self.feeds = feeds

    def search(self, roles: list[str], limit: int) -> list[Job]:
        results: list[Job] = []
        for url in self.feeds:
            content = _fetch(url)
            if not content:
                continue
            results.extend(parse_feed(content, source_url=url))
            if len(results) >= limit:
                break
        return results[:limit]
