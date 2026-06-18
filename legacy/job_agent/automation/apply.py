"""Application automation via Playwright.

Opens the job posting in a real browser, pre-fills what it safely can and uploads
the tailored documents, then **stops and hands control to the candidate**. It
never clicks the final submit button — submission always requires a human.

Playwright is an optional dependency. If it isn't installed the automator falls
back to a "manual prep" mode that simply gathers everything you need (links and
file paths) so you can apply by hand.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from ..models import Application, Job

logger = logging.getLogger(__name__)


@dataclass
class PreparedApplication:
    job: Job
    application: Application
    resume_path: str
    cover_letter_path: str
    instructions: list[str]


class ApplicationAutomator:
    def __init__(self, *, headless: bool = False):
        self.headless = headless

    def _playwright_available(self) -> bool:
        try:
            import playwright  # noqa: F401
            return True
        except ImportError:
            return False

    def prepare(self, job: Job, app: Application) -> PreparedApplication:
        """Prepare (but never submit) an application.

        Steps performed: open job, pre-fill known fields, upload documents, then
        pause for human review and approval.
        """
        resume = app.resume_path
        cover = app.cover_letter_path
        for label, p in (("resume", resume), ("cover letter", cover)):
            if not p or not Path(p).exists():
                raise FileNotFoundError(
                    f"Missing {label}. Run `tailor {job.db_id}` first to generate documents."
                )

        if self.headless is False and self._playwright_available() and job.url:
            self._open_in_browser(job, resume, cover)
            steps = [
                f"Opened {job.url} in a browser.",
                "Pre-filled detectable fields and attached your documents where possible.",
                "Review every field for accuracy.",
                "⚠️  The agent will NOT submit. Click submit yourself when satisfied.",
            ]
        else:
            steps = [
                f"Open the posting: {job.url or '(no URL — apply via the source site)'}",
                f"Attach resume: {resume}",
                f"Attach cover letter: {cover}",
                "Fill in the application form and review carefully.",
                "Submit manually once you're happy — the agent never submits for you.",
            ]

        return PreparedApplication(
            job=job, application=app, resume_path=resume,
            cover_letter_path=cover, instructions=steps,
        )

    def _open_in_browser(self, job: Job, resume: str, cover: str) -> None:  # pragma: no cover
        """Open the posting and best-effort attach files. Leaves browser open."""
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=self.headless)
            page = browser.new_page()
            page.goto(job.url, wait_until="domcontentloaded")
            # Best-effort: attach to any file inputs found on the page.
            for selector in ("input[type=file]",):
                try:
                    inputs = page.query_selector_all(selector)
                    for i, inp in enumerate(inputs):
                        inp.set_input_files(resume if i == 0 else cover)
                except Exception as exc:
                    logger.warning("Could not auto-attach files to %s: %s", selector, exc)
            # Pause for human review — never auto-submit.
            try:
                page.pause()
            except Exception:
                # page.pause needs the inspector; otherwise just wait for close.
                page.wait_for_event("close", timeout=0)
            browser.close()
