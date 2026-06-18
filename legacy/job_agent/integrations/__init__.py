"""External integrations (email draft creation, Thunderbird, SMTP)."""

from .email_draft import (
    build_email_message,
    open_in_thunderbird,
    save_eml,
    send_via_smtp,
)

__all__ = [
    "build_email_message",
    "save_eml",
    "open_in_thunderbird",
    "send_via_smtp",
]
