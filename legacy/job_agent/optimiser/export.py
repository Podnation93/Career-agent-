"""Render tailored documents to clean, print-ready HTML.

The optimiser produces plain text (robust for ATS copy-paste). This module wraps
that text in a minimal, print-friendly HTML page so it can be opened in a browser
and saved as PDF (Ctrl/Cmd-P → Save as PDF) without any extra dependencies.
"""

from __future__ import annotations

import html

_CSS = """
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a;
         max-width: 760px; margin: 40px auto; padding: 0 24px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .doc { white-space: pre-wrap; font-size: 14px; }
  @media print { body { margin: 0; } }
"""


def to_html(text: str, title: str = "Document") -> str:
    safe = html.escape(text)
    return (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n"
        "<meta charset=\"utf-8\">\n"
        f"<title>{html.escape(title)}</title>\n"
        f"<style>{_CSS}</style>\n</head>\n<body>\n"
        f"<div class=\"doc\">{safe}</div>\n</body>\n</html>\n"
    )
