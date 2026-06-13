# Personal AI Job Application Agent

A personal AI recruiter that understands your professional profile, finds
high-quality jobs around **Western Melbourne, Melbourne CBD and Richmond**,
tailors your resume and cover letter to each role, tracks every application,
and learns what works.

> **Philosophy:** This is *not* a mass-apply spray-and-pray bot. It is a
> careful career assistant that surfaces a small number of well-matched jobs,
> customises your documents truthfully, and **never submits an application
> without your explicit approval.**

---

## What it does

| Capability | Module |
|---|---|
| Imports & understands your resume | `job_agent/profile` |
| Learns your cover-letter style & career story | `job_agent/profile` |
| Searches multiple job boards (pluggable adapters) | `job_agent/search` |
| Filters to your preferred Melbourne locations | `job_agent/location` |
| Scores each job (skills / experience / location / growth) | `job_agent/matching` |
| Rewrites your resume per role (ATS-optimised, truthful) | `job_agent/optimiser` |
| Generates short + full cover letters per role | `job_agent/optimiser` |
| Prepares applications via browser automation | `job_agent/automation` |
| Tracks every application & status | `job_agent/tracker` |
| Produces a daily opportunities report | `job_agent/reports` |
| Learns which applications get responses | `job_agent/analytics` |
| Web dashboard + CLI | `job_agent/web`, `job_agent/cli.py` |

---

## System architecture

```
                         ┌──────────────────────────┐
                         │        config.yaml        │
                         │ locations · roles · model │
                         └────────────┬──────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
   ┌────────▼────────┐      ┌─────────▼─────────┐     ┌─────────▼─────────┐
   │  Profile Memory │      │  Job Search Engine │     │   AI Provider     │
   │  • resume       │      │  • Seek adapter    │     │  • local (Ollama) │
   │  • cover style  │      │  • LinkedIn adapter│     │  • Anthropic      │
   │  (SQLite)       │      │  • Indeed adapter  │     │  • heuristic      │
   └────────┬────────┘      │  • Sample adapter  │     └─────────┬─────────┘
            │               └─────────┬──────────┘               │
            │                         │                          │
            │               ┌─────────▼──────────┐               │
            │               │  Location Filter   │               │
            │               │  (suburb matching) │               │
            │               └─────────┬──────────┘               │
            │                         │                          │
            └────────────┬────────────┴───────────┬──────────────┘
                         │                         │
               ┌─────────▼──────────┐    ┌─────────▼──────────┐
               │   Job Matching AI  │    │  Resume Optimiser  │
               │  match score 0-100 │    │  + Cover Letter Gen│
               └─────────┬──────────┘    └─────────┬──────────┘
                         │                         │
               ┌─────────▼─────────────────────────▼──────────┐
               │              Application Tracker (SQLite)      │
               └─────────┬─────────────────────────┬──────────┘
                         │                         │
               ┌─────────▼──────────┐    ┌─────────▼──────────┐
               │  Daily Report      │    │     Analytics      │
               └────────────────────┘    └────────────────────┘
                         │
               ┌─────────▼──────────┐    ┌────────────────────┐
               │  Web Dashboard     │    │ Application         │
               │  (FastAPI)         │    │ Automation (Playwr.)│
               └────────────────────┘    └────────────────────┘
```

---

## Setup

```bash
# 1. Clone & enter
cd career-agent

# 2. Create a virtualenv
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. (Optional) install Playwright browsers for application automation
python -m playwright install chromium

# 5. Initialise the database
python -m job_agent.cli init

# 6. Import your resume (PDF, DOCX, TXT or JSON)
python -m job_agent.cli import-resume /path/to/your_resume.pdf

# 7. Set your cover-letter style (free text, or a sample letter file)
python -m job_agent.cli set-cover-style /path/to/sample_cover_letter.txt

# 8. Find jobs (uses the sample source out-of-the-box)
python -m job_agent.cli search

# 9. See today's report
python -m job_agent.cli report

# 10. Tailor documents for a specific job id
python -m job_agent.cli tailor <job_id>

# 11. Launch the web dashboard
python -m job_agent.cli serve   # http://127.0.0.1:8000
```

---

## AI provider

The agent works **without any API key** using a deterministic heuristic engine
for matching and document generation. To get higher-quality writing you can plug
in an LLM:

* **Local (recommended for privacy):** run [Ollama](https://ollama.com) and set
  `ai.provider: ollama` in `config.yaml`.
* **Anthropic Claude:** set `ai.provider: anthropic` and the
  `ANTHROPIC_API_KEY` environment variable.

See `config.yaml` for all options.

---

## Locations

Configured in `config.yaml` under `locations`. Out of the box it targets Western
Melbourne, Melbourne CBD and Richmond, accepts hybrid/remote roles, and rejects
distant suburbs. Every job is tagged with a location match of
**Excellent / Good / Poor**.

---

## Legal & ethical note

Scraping LinkedIn / Seek / Indeed may violate their Terms of Service and is
rate-limited / blocked in practice. The bundled adapters are **scaffolds**: the
`sample` source ships real example data so the whole pipeline runs end-to-end,
and the real adapters document where to add your own compliant data source (e.g.
official APIs, RSS feeds, or manual exports). Always respect each site's ToS and
`robots.txt`, and use the automation responsibly. The agent never submits an
application without your approval.

---

## Project layout

```
job_agent/
├── cli.py              # command-line entry point
├── config.py           # loads config.yaml
├── db.py               # SQLite schema + helpers
├── models.py           # dataclasses (Job, Profile, Application...)
├── ai/                 # pluggable AI provider (heuristic/ollama/anthropic)
├── profile/            # resume + cover-letter memory
├── search/             # job-board adapters
├── location/           # Melbourne suburb filter
├── matching/           # match scoring
├── optimiser/          # resume + cover-letter generation
├── automation/         # Playwright application prep
├── tracker/            # application tracker
├── analytics/          # learning / response analytics
├── reports/            # daily report
└── web/                # FastAPI dashboard
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/SETUP.md`](docs/SETUP.md) for the detailed setup walkthrough.
</content>
</invoke>
