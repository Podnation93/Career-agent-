"""Profile memory: resume import and cover-letter style."""

from .resume import extract_profile_from_file, extract_profile_from_text
from .cover_letter import set_cover_style

__all__ = ["extract_profile_from_file", "extract_profile_from_text", "set_cover_style"]
