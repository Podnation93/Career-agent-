"""FastAPI dashboard for the job agent.

A lightweight web UI over the same :class:`JobAgent` service used by the CLI:
view top matches, trigger a search, tailor documents, and see the tracker and
analytics. Run with ``python -m job_agent.cli serve``.

Single-user, local tool: the server binds to 127.0.0.1 by default and has no
auth/CSRF. Do not expose it to a network without putting auth in front of it.
"""

from __future__ import annotations

from pathlib import Path

from ..service import JobAgent

_TEMPLATES = Path(__file__).parent / "templates"


def _read_within(path: Path, root: Path) -> str | None:
    """Read a file only if it resolves inside ``root`` and exists.

    Defence in depth: document paths come from the DB, so confining reads to the
    configured output dir prevents a tampered path (e.g. ``../../etc/passwd``)
    from being served.
    """
    try:
        resolved = path.resolve()
        if not resolved.is_relative_to(root):
            return None
        if resolved.exists():
            return resolved.read_text(encoding="utf-8")
    except (OSError, ValueError):
        return None
    return None


def create_app():
    try:
        from fastapi import FastAPI, Form
        from fastapi.responses import HTMLResponse, RedirectResponse
        from jinja2 import Environment, FileSystemLoader, select_autoescape
    except ImportError as exc:  # pragma: no cover - dependency guidance
        raise RuntimeError(
            "The web dashboard needs fastapi, uvicorn and jinja2. Install with "
            "`pip install -r requirements.txt`."
        ) from exc

    app = FastAPI(title="Personal AI Job Application Agent")
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES)),
        autoescape=select_autoescape(["html"]),
    )

    def render(name: str, **ctx) -> "HTMLResponse":
        return HTMLResponse(env.get_template(name).render(**ctx))

    @app.get("/", response_class=HTMLResponse)
    def index():
        agent = JobAgent()
        try:
            profile = agent.get_profile()
            jobs = agent.top_jobs(limit=20)
            apps = {a.job_id: a for a in agent.tracker.all()}
            analytics = agent.analytics()
        finally:
            agent.close()
        return render("dashboard.html", profile=profile, jobs=jobs,
                      apps=apps, analytics=analytics)

    @app.post("/search")
    def search():
        agent = JobAgent()
        try:
            agent.init()
            agent.search()
        finally:
            agent.close()
        return RedirectResponse("/", status_code=303)

    @app.post("/tailor")
    def tailor(job_id: int = Form(...)):
        agent = JobAgent()
        try:
            agent.tailor(job_id)
        finally:
            agent.close()
        return RedirectResponse(f"/job/{job_id}", status_code=303)

    @app.post("/status")
    def status(job_id: int = Form(...), status: str = Form(...)):
        agent = JobAgent()
        try:
            agent.set_status(job_id, status)
        finally:
            agent.close()
        return RedirectResponse("/", status_code=303)

    @app.get("/job/{job_id}", response_class=HTMLResponse)
    def job_detail(job_id: int):
        agent = JobAgent()
        try:
            job = agent.db.get_job(job_id)
            app_row = agent.db.get_application_for_job(job_id)
            output_root = agent.cfg.output_dir.resolve()
        finally:
            agent.close()
        if not job:
            return HTMLResponse("Job not found", status_code=404)
        docs = {}
        if app_row and app_row.resume_path:
            doc_dir = Path(app_row.resume_path).parent
            for label, path in (("ats_report", doc_dir / "ats_report.txt"),
                                ("resume", app_row.resume_path),
                                ("cover_letter", app_row.cover_letter_path)):
                content = _read_within(Path(path), output_root)
                if content is not None:
                    docs[label] = content
        return render("job.html", job=job, app=app_row, docs=docs)

    return app


def run(host: str = "127.0.0.1", port: int = 8000) -> None:  # pragma: no cover
    import uvicorn
    uvicorn.run(create_app(), host=host, port=port)
