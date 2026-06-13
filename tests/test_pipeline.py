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


def test_html_export_escapes():
    from job_agent.optimiser import to_html

    html_out = to_html("Skills: C++ & <script>", "Resume")
    assert "<script>" not in html_out  # escaped
    assert "&lt;script&gt;" in html_out
    assert "<!doctype html>" in html_out


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
