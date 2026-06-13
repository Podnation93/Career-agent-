"""External integrations (email draft creation, Thunderbird)."""

from .email_draft import build_email_message, save_eml, open_in_thunderbird

__all__ = ["build_email_message", "save_eml", "open_in_thunderbird"]
