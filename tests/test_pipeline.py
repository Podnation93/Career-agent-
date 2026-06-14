"""End-to-end-ish tests for the agent pipeline using the heuristic provider.

These run fully offline (no network, no LLM) and exercise profile extraction,
location filtering, scoring, document generation and the tracker.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from job_agent.config import load_config
from job_agent.location import LocationFilter
from job_agent.matching import MatchScorer
from job_agent.models import ApplicationStatus, Job
from job_agent.optimiser import CoverLetterGenerator, ResumeOptimiser
from job_agent.profile import extract_profile_from_file
from job_agent.ai import HeuristicProvider
from job_agent.service import JobAgent

ROOT = Path(__file__).resolve().parent.parent
SAMPLE_PROFILE = ROOT / "examples" / "sample_profile.json"


@pytest.fixture()
def cfg(tmp_path, monkeypatch):
    # Point the agent at a throwaway database under tmp_path.
    base = load_config()
    base._data["database"] = str(tmp_path / "test.db")
    base._data["output_dir"] = str(tmp_path / "apps")
    return base


@pytest.fixture()
def profile():
    return extract_profile_from_file(SAMPLE_PROFILE)


def test_profile_extraction(profile):
    assert profile.name == "Alex Candidate"
    assert "Active Directory" in profile.technical_skills
    assert len(profile.work_history) == 2
    assert profile.cover_letter_style  # style anchor present


def test_location_filter(cfg):
    lf = LocationFilter(cfg)
    excellent = Job(source="t", external_id="1", title="x", company="c", location="Sunshine, VIC")
    assert lf.classify(excellent).value == "Excellent"

    remote = Job(source="t", external_id="2", title="x", company="c", location="Remote (Australia)", remote=True)
    assert lf.classify(remote).value == "Excellent"

    poor = Job(source="t", external_id="3", title="x", company="c", location="Geelong, VIC")
    assert lf.classify(poor).value == "Poor"

    # "no remote option" must NOT be read as a remote role.
    negated = Job(source="t", external_id="4", title="x", company="c",
                  location="Geelong, VIC", description="On-site in Geelong, no remote option.")
    assert lf.classify(negated).value == "Poor"
    assert negated.remote is False


def test_scoring_prefers_local_relevant_jobs(cfg, profile):
    scorer = MatchScorer(cfg, profile)
    local = Job(source="t", external_id="1", title="IT Support Officer", company="c",
                location="Sunshine, VIC",
                description="Windows, Microsoft 365, Active Directory, ServiceNow ticketing, help desk")
    far = Job(source="t", external_id="2", title="Network Administrator", company="c",
              location="Geelong, VIC", description="CCNA routing switching firewalls")
    scorer.score(local)
    scorer.score(far)
    assert local.overall_score > far.overall_score
    assert local.location_match == "Excellent"
    assert local.requirements_met  # detected overlap


def test_document_generation_is_truthful(profile):
    ai = HeuristicProvider()
    job = Job(source="t", external_id="1", title="Cybersecurity Analyst", company="SecureCloud",
              location="Melbourne CBD", description="SIEM Sentinel incident response Python")
    resume = ResumeOptimiser(ai, profile).build(job)
    assert profile.name in resume
    # A skill the candidate does NOT have must not be fabricated into the resume.
    assert "Kubernetes" not in resume

    clg = CoverLetterGenerator(ai, profile)
    short = clg.short(job)
    full = clg.full(job)
    assert "SecureCloud" in full
    assert job.title in full
    assert len(short) < len(full)


def test_rss_parser():
    from job_agent.search.rss import parse_feed

    rss = """<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <title>Jobs</title>
      <item>
        <title>Service Desk Analyst at Acme Corp</title>
        <link>https://jobs.example.com/123</link>
        <guid>job-123</guid>
        <description>&lt;p&gt;Support role in Richmond, VIC. M365 and Active Directory.&lt;/p&gt;</description>
        <pubDate>Mon, 09 Jun 2026 00:00:00 GMT</pubDate>
      </item>
    </channel></rss>"""
    jobs = parse_feed(rss)
    assert len(jobs) == 1
    j = jobs[0]
    assert j.title == "Service Desk Analyst"
    assert j.company == "Acme Corp"
    assert j.location == "Richmond, VIC"
    assert "<p>" not in j.description  # HTML stripped
    assert j.url == "https://jobs.example.com/123"
    assert j.external_id == "job-123"


def test_rss_parser_handles_garbage():
    from job_agent.search.rss import parse_feed

    assert parse_feed("not xml at all") == []


def test_rss_stable_external_id_no_guid():
    from job_agent.search.rss import parse_feed

    # Two distinct same-titled items with no guid/link must get distinct,
    # stable ids (not collide under UNIQUE(source, external_id)).
    rss = """<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>Support Officer at Acme</title><description>Role A</description></item>
      <item><title>Support Officer at Globex</title><description>Role B</description></item>
    </channel></rss>"""
    jobs = parse_feed(rss)
    ids = [j.external_id for j in jobs]
    assert len(ids) == 2
    assert ids[0] != ids[1]              # no collision
    assert all(i for i in ids)           # non-empty
    # Deterministic across runs.
    assert parse_feed(rss)[0].external_id == ids[0]


def test_rss_fetch_rejects_non_http_scheme():
    from job_agent.search.rss import _fetch

    assert _fetch("file:///etc/passwd") is None


def test_migrate_adds_pending_column(tmp_path):
    import sqlite3
    from job_agent.db import Database

    # Simulate an older DB whose applications table predates the `pending` column.
    old = tmp_path / "old.db"
    con = sqlite3.connect(old)
    con.execute("CREATE TABLE applications (id INTEGER PRIMARY KEY, job_id INTEGER, status TEXT)")
    con.commit()
    con.close()

    db = Database(old)
    db.init_schema()  # runs _migrate()
    cols = {r["name"] for r in db.conn.execute("PRAGMA table_info(applications)")}
    db.close()
    assert "pending" in cols


def test_web_dashboard_smoke(cfg, monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("jinja2")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient
    import job_agent.web.app as webmod

    agent = JobAgent(cfg)
    agent.init()
    agent.import_resume(str(SAMPLE_PROFILE))
    jobs = agent.search()
    job_id = jobs[0].db_id
    agent.tailor(job_id)
    agent.close()

    # Point the web app's per-request agent at the same temp config/DB.
    monkeypatch.setattr(webmod, "JobAgent", lambda *a, **k: JobAgent(cfg))
    client = TestClient(webmod.create_app())

    r = client.get("/")
    assert r.status_code == 200
    r2 = client.get(f"/job/{job_id}")
    assert r2.status_code == 200
    assert "ATS" in r2.text


def test_digest_writes_markdown(cfg, tmp_path, monkeypatch):
    # Ensure no SMTP config so the digest is written but not emailed.
    for var in ("SMTP_HOST", "DIGEST_TO"):
        monkeypatch.delenv(var, raising=False)
    agent = JobAgent(cfg)
    try:
        agent.init()
        agent.import_resume(str(SAMPLE_PROFILE))
        out = tmp_path / "digest.md"
        result = agent.digest(top_n=2, out_path=str(out))
        assert out.exists()
        text = out.read_text()
        assert "Job digest" in text
        assert "JOB OPPORTUNITIES FOUND" in text
        assert len(result["tailored"]) == 2
        assert result["emailed"] is False
    finally:
        agent.close()


def test_smtp_send_invokes_smtp(monkeypatch):
    import smtplib
    from job_agent.integrations import build_email_message, send_via_smtp

    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=30):
            sent["host"] = host
            sent["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            sent["tls"] = True

        def login(self, user, password):
            sent["login"] = (user, password)

        def send_message(self, msg):
            sent["subject"] = msg["Subject"]

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    msg = build_email_message(sender="me@x.com", subject="Job digest", body="hi", to="you@y.com")
    ok = send_via_smtp(msg, host="smtp.example.com", port=587,
                       username="u", password="p")
    assert ok is True
    assert sent["host"] == "smtp.example.com"
    assert sent["tls"] is True
    assert sent["login"] == ("u", "p")
    assert sent["subject"] == "Job digest"


def test_search_is_idempotent(cfg):
    agent = JobAgent(cfg)
    try:
        agent.init()
        agent.import_resume(str(SAMPLE_PROFILE))
        first = {j.external_id: j.db_id for j in agent.search()}
        second = {j.external_id: j.db_id for j in agent.search()}
        # All ids non-zero and stable across re-runs.
        assert all(v and v > 0 for v in first.values())
        assert first == second
        # No duplicate applications created on the second pass.
        apps = agent.tracker.all()
        assert len({a.job_id for a in apps}) == len(apps) == len(first)
    finally:
        agent.close()


def test_html_export_escapes():
    from job_agent.optimiser import to_html

    html_out = to_html("Skills: C++ & <script>", "Resume")
    assert "<script>" not in html_out  # escaped
    assert "&lt;script&gt;" in html_out
    assert "<!doctype html>" in html_out


def test_ats_report():
    from job_agent.optimiser.ats import ats_report

    job = Job(source="t", external_id="1", title="IT Support", company="c",
              location="Sunshine, VIC",
              description="Windows, Microsoft 365, Active Directory, help desk, teamwork")
    good = (
        "Alex Candidate\nalex@example.com\n\nPROFESSIONAL SUMMARY\nIT support pro.\n"
        "KEY SKILLS\nWindows Server, Microsoft 365, Active Directory, Help Desk, Teamwork\n"
        "EXPERIENCE\nIT Support Technician\nEDUCATION\nDiploma of IT\n" + ("word " * 220)
    )
    r = ats_report(good, job)
    assert r.score >= 70
    assert r.has_contact
    assert "skills" in r.present_sections

    thin = "Just some text with no keywords or sections."
    r2 = ats_report(thin, job)
    assert r2.score < r.score
    assert r2.missing_sections
    assert any("keyword" in s.lower() or "section" in s.lower() for s in r2.suggestions)


def test_email_draft_building(tmp_path):
    from job_agent.integrations import build_email_message, save_eml

    resume = tmp_path / "resume.txt"
    cover = tmp_path / "cover_letter.txt"
    resume.write_text("RESUME CONTENT", encoding="utf-8")
    cover.write_text("COVER CONTENT", encoding="utf-8")

    msg = build_email_message(
        sender="alex@example.com", subject="Application — IT Support",
        body="Hi, please consider me.", to="recruiter@acme.com",
        attachments=[str(resume), str(cover)],
    )
    assert msg["Subject"] == "Application — IT Support"
    assert msg["To"] == "recruiter@acme.com"
    assert msg["From"] == "alex@example.com"
    attached = [p.get_filename() for p in msg.iter_attachments()]
    assert "resume.txt" in attached and "cover_letter.txt" in attached

    eml = save_eml(msg, tmp_path / "application.eml")
    assert Path(eml).exists()
    assert b"Application" in Path(eml).read_bytes()


def test_daily_and_email_flow(cfg):
    agent = JobAgent(cfg)
    try:
        agent.init()
        agent.import_resume(str(SAMPLE_PROFILE))
        result = agent.daily(top_n=2)
        assert "JOB OPPORTUNITIES FOUND" in result["report"]
        assert len(result["tailored"]) == 2
        assert all(0 <= t["ats_score"] <= 100 for t in result["tailored"])

        job_id = result["tailored"][0]["job_id"]
        draft = agent.email_draft(job_id, to="recruiter@example.com")
        assert Path(draft["eml"]).exists()
        assert "Application" in draft["subject"]
    finally:
        agent.close()


def test_approval_gated_apply(cfg):
    from job_agent.models import ApplicationStatus

    agent = JobAgent(cfg)
    try:
        agent.init()
        agent.import_resume(str(SAMPLE_PROFILE))
        jobs = agent.search()
        job_id = jobs[0].db_id

        # Requesting an apply prepares everything but sends nothing.
        plan = agent.request_apply(job_id, via="email", to="recruiter@example.com")
        assert plan["via"] == "email"
        assert Path(plan["eml"]).exists()
        app = agent.db.get_application_for_job(job_id)
        assert app.status == ApplicationStatus.AWAITING_APPROVAL.value
        assert app.pending  # plan stored

        assert any(p["job_id"] == job_id for p in agent.pending_approvals())

        # Approval marks it Applied (Thunderbird not present in CI → no launch).
        result = agent.approve_apply(job_id, open_thunderbird=False)
        assert result["via"] == "email"
        app = agent.db.get_application_for_job(job_id)
        assert app.status == ApplicationStatus.APPLIED.value
        assert app.date_applied
        assert not app.pending  # cleared

        # Approving again should fail (nothing pending).
        with pytest.raises(ValueError):
            agent.approve_apply(job_id)
    finally:
        agent.close()


def test_reject_apply_returns_to_preparing(cfg):
    from job_agent.models import ApplicationStatus

    agent = JobAgent(cfg)
    try:
        agent.init()
        agent.import_resume(str(SAMPLE_PROFILE))
        jobs = agent.search()
        job_id = jobs[0].db_id
        agent.request_apply(job_id, via="email")
        agent.reject_apply(job_id, reason="changed my mind")
        app = agent.db.get_application_for_job(job_id)
        assert app.status == ApplicationStatus.PREPARING.value
        assert not app.pending
        assert "changed my mind" in app.notes
    finally:
        agent.close()


def test_full_agent_flow(cfg):
    agent = JobAgent(cfg)
    try:
        agent.init()
        agent.import_resume(str(SAMPLE_PROFILE))
        jobs = agent.search()
        assert jobs, "sample source should yield jobs"
        top = jobs[0]
        assert top.overall_score >= jobs[-1].overall_score  # sorted desc

        paths = agent.tailor(top.db_id)
        assert Path(paths["resume"]).exists()
        assert Path(paths["cover_letter"]).exists()

        app = agent.set_status(top.db_id, ApplicationStatus.APPLIED.value)
        assert app.status == "Applied"
        assert app.date_applied

        report = agent.daily_report()
        assert "JOB OPPORTUNITIES FOUND" in report

        analytics = agent.analytics()
        assert analytics.total >= 1
    finally:
        agent.close()
