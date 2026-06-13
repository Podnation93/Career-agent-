"""Command-line interface for the Personal AI Job Application Agent.

Run ``python -m job_agent.cli <command>``. Commands:

    init                       Initialise the database and folders
    import-resume <file>       Import a resume (PDF/DOCX/TXT/JSON)
    set-cover-style <file>     Store a sample cover letter as your style anchor
    profile                    Show the stored profile summary
    search                     Find & score jobs, store them
    report                     Show today's opportunities report
    jobs                       List stored jobs (highest match first)
    tailor <job_id>            Generate tailored resume + cover letters
    apply <job_id>             Prepare an application (never submits)
    status <job_id> <status>   Update an application's status
    track                      Show the application tracker
    analytics                  Show response analytics / learnings
    serve                      Launch the web dashboard
"""

from __future__ import annotations

import argparse
import sys

from .models import ApplicationStatus
from .service import JobAgent


def _print_profile(profile) -> None:
    print(f"Name:           {profile.name or '(unknown)'}")
    print(f"Email:          {profile.email or '(unknown)'}")
    print(f"Phone:          {profile.phone or '(unknown)'}")
    print(f"Technical:      {', '.join(profile.technical_skills) or '(none detected)'}")
    print(f"Soft skills:    {', '.join(profile.soft_skills) or '(none detected)'}")
    print(f"Certifications: {', '.join(profile.certifications) or '(none detected)'}")
    print(f"Work history:   {len(profile.work_history)} role(s)")
    print(f"Cover style:    {'set' if profile.cover_letter_style else 'not set'}")


def cmd_init(agent: JobAgent, args) -> None:
    agent.init()
    print(f"Initialised database at {agent.cfg.database_path}")
    print(f"Applications will be written to {agent.cfg.output_dir}")


def cmd_import_resume(agent: JobAgent, args) -> None:
    agent.init()
    profile = agent.import_resume(args.file)
    print("Imported resume. Extracted profile:\n")
    _print_profile(profile)


def cmd_set_cover_style(agent: JobAgent, args) -> None:
    profile = agent.set_cover_style(
        sample_file=args.file if args.file else None,
        style=args.text or "",
        career_story=args.career_story or "",
        motivations=args.motivations or "",
    )
    print("Cover-letter style updated.")
    if profile.cover_letter_style:
        preview = profile.cover_letter_style[:200]
        print(f"Style anchor preview:\n{preview}...")


def cmd_profile(agent: JobAgent, args) -> None:
    profile = agent.get_profile()
    if not profile:
        print("No profile yet. Run: import-resume <file>")
        return
    _print_profile(profile)


def cmd_search(agent: JobAgent, args) -> None:
    agent.init()
    jobs = agent.search()
    print(f"Searched {agent.cfg.search_sources}. Scored {len(jobs)} job(s).\n")
    for j in jobs[:10]:
        print(f"  [{j.overall_score:3d}] {j.title} — {j.company} ({j.location_match}) id={j.db_id}")


def cmd_report(agent: JobAgent, args) -> None:
    print(agent.daily_report(limit=args.limit))


def cmd_jobs(agent: JobAgent, args) -> None:
    jobs = agent.db.list_jobs(min_score=0, limit=args.limit)
    for j in jobs:
        print(f"  [{j.overall_score:3d}] id={j.db_id} {j.title} — {j.company} "
              f"({j.location} / {j.location_match})")


def cmd_tailor(agent: JobAgent, args) -> None:
    paths = agent.tailor(args.job_id)
    print("Generated tailored documents:")
    for k, v in paths.items():
        print(f"  {k}: {v}")


def cmd_apply(agent: JobAgent, args) -> None:
    prepared = agent.prepare_application(args.job_id, headless=args.headless)
    print(f"Preparing application for {prepared.job.title} @ {prepared.job.company}\n")
    for step in prepared.instructions:
        print(f"  • {step}")
    print("\nReminder: the agent never submits — you stay in control.")


def cmd_status(agent: JobAgent, args) -> None:
    app = agent.set_status(args.job_id, args.status, note=args.note or "")
    print(f"Job {args.job_id} → {app.status}")


def cmd_track(agent: JobAgent, args) -> None:
    apps = agent.tracker.all()
    if not apps:
        print("No applications tracked yet.")
        return
    print(f"{'JOB':>4}  {'STATUS':<10} {'SCORE':>5}  COMPANY / ROLE / LOCATION")
    for a in apps:
        print(f"{a.job_id:>4}  {a.status:<10} {a.match_score:>5}  "
              f"{a.company} / {a.role} / {a.location}")


def cmd_analytics(agent: JobAgent, args) -> None:
    r = agent.analytics()
    print(f"Applications: {r.total} | Applied: {r.applied} | Responses: {r.responses} "
          f"({r.response_rate}%)")
    print(f"Interviews: {r.interviews} | Offers: {r.offers} | Rejected: {r.rejected}")
    if r.top_response_keywords:
        print("Top keywords in responsive applications:")
        for kw, n in r.top_response_keywords:
            print(f"  • {kw} ({n})")
    print("\nInsights:")
    for ins in r.insights:
        print(f"  • {ins}")


def cmd_serve(agent: JobAgent, args) -> None:
    from .web.app import run
    agent.close()  # web app manages its own connection
    run(host=args.host, port=args.port)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="job_agent", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="Initialise database and folders")

    sp = sub.add_parser("import-resume", help="Import a resume file")
    sp.add_argument("file")

    sp = sub.add_parser("set-cover-style", help="Set cover-letter style")
    sp.add_argument("file", nargs="?", help="Sample cover letter file")
    sp.add_argument("--text", help="Inline style description")
    sp.add_argument("--career-story", help="Your career story")
    sp.add_argument("--motivations", help="Why you're applying / goals")

    sub.add_parser("profile", help="Show stored profile")

    sub.add_parser("search", help="Find & score jobs")

    sp = sub.add_parser("report", help="Show daily opportunities report")
    sp.add_argument("--limit", type=int, default=10)

    sp = sub.add_parser("jobs", help="List stored jobs")
    sp.add_argument("--limit", type=int, default=50)

    sp = sub.add_parser("tailor", help="Generate tailored documents")
    sp.add_argument("job_id", type=int)

    sp = sub.add_parser("apply", help="Prepare an application (never submits)")
    sp.add_argument("job_id", type=int)
    sp.add_argument("--headless", action="store_true")

    sp = sub.add_parser("status", help="Update application status")
    sp.add_argument("job_id", type=int)
    sp.add_argument("status", choices=[s.value for s in ApplicationStatus])
    sp.add_argument("--note", help="Optional note")

    sub.add_parser("track", help="Show application tracker")
    sub.add_parser("analytics", help="Show response analytics")

    sp = sub.add_parser("serve", help="Launch web dashboard")
    sp.add_argument("--host", default="127.0.0.1")
    sp.add_argument("--port", type=int, default=8000)

    return p


COMMANDS = {
    "init": cmd_init,
    "import-resume": cmd_import_resume,
    "set-cover-style": cmd_set_cover_style,
    "profile": cmd_profile,
    "search": cmd_search,
    "report": cmd_report,
    "jobs": cmd_jobs,
    "tailor": cmd_tailor,
    "apply": cmd_apply,
    "status": cmd_status,
    "track": cmd_track,
    "analytics": cmd_analytics,
    "serve": cmd_serve,
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    agent = JobAgent()
    try:
        COMMANDS[args.command](agent, args)
    except (RuntimeError, ValueError, FileNotFoundError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        if args.command != "serve":
            agent.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
