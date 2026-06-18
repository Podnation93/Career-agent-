"""Cover-letter memory.

Stores the candidate's preferred writing style, career story and motivations so
the generator can produce letters that sound like them rather than a template.
"""

from __future__ import annotations

from pathlib import Path

from ..models import Profile


def set_cover_style(
    profile: Profile,
    *,
    style: str = "",
    career_story: str = "",
    motivations: str = "",
    sample_file: str | Path | None = None,
) -> Profile:
    """Update a profile's cover-letter memory in place and return it.

    A sample cover letter (if provided) is stored verbatim as the style anchor —
    the generator uses it to mirror tone, length and structure.
    """
    if sample_file:
        sample_text = Path(sample_file).read_text(encoding="utf-8", errors="ignore")
        profile.cover_letter_style = sample_text.strip()
    elif style:
        profile.cover_letter_style = style.strip()

    if career_story:
        profile.career_story = career_story.strip()
    if motivations:
        profile.motivations = motivations.strip()
    return profile
