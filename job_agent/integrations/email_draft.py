"""Email application drafts — Thunderbird-friendly, never auto-sent.

Builds a standard ``.eml`` message (RFC 5322) for a job application, with the
recruiter cover-letter as the body and the tailored resume + cover letter
attached. The ``.eml`` opens directly in Thunderbird (double-click, or
File → Open Saved Message), and ``open_in_thunderbird`` launches a pre-filled
compose window so you can review and hit send yourself.

Nothing here sends mail — it only prepares a draft for your review.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from email.message import EmailMessage
from pathlib import Path

logger = logging.getLogger(__name__)


def build_email_message(
    *,
    sender: str,
    subject: str,
    body: str,
    to: str = "",
    attachments: list[str] | None = None,
) -> EmailMessage:
    """Build an EmailMessage with optional file attachments."""
    msg = EmailMessage()
    if sender:
        msg["From"] = sender
    if to:
        msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    for path in attachments or []:
        p = Path(path)
        if not p.exists():
            continue
        data = p.read_bytes()
        # Tailored docs are text; attach as text/plain with the right filename.
        msg.add_attachment(
            data, maintype="text", subtype="plain", filename=p.name
        )
    return msg


def save_eml(msg: EmailMessage, path: str | Path) -> str:
    """Write the message to a .eml file (opens as a draft in Thunderbird)."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(bytes(msg))
    return str(p)


def _escape(value: str) -> str:
    """Escape a value for Thunderbird's -compose field syntax."""
    # Fields are comma-separated and quoted; neutralise quotes/commas/newlines.
    return value.replace("'", "’").replace(",", " ").replace("\n", " ").strip()


def open_in_thunderbird(
    *,
    subject: str,
    body: str,
    to: str = "",
    attachments: list[str] | None = None,
    binary: str | None = None,
) -> bool:
    """Launch Thunderbird's compose window pre-filled. Returns True if launched.

    Falls back to ``False`` (no exception) when Thunderbird isn't installed, so
    callers can rely on the saved ``.eml`` instead.
    """
    tb = binary or shutil.which("thunderbird")
    if not tb:
        return False

    file_urls = ",".join(
        Path(a).resolve().as_uri() for a in (attachments or []) if Path(a).exists()
    )
    fields = [f"subject='{_escape(subject)}'", f"body='{_escape(body)}'"]
    if to:
        fields.insert(0, f"to='{_escape(to)}'")
    if file_urls:
        fields.append(f"attachment='{file_urls}'")
    compose_arg = ",".join(fields)

    try:
        subprocess.Popen([tb, "-compose", compose_arg])  # noqa: S603 - local app launch
        return True
    except Exception as exc:
        logger.warning("Failed to launch Thunderbird compose: %s", exc)
        return False
