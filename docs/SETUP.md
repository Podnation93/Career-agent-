# Setup & usage walkthrough

A step-by-step guide to going from a fresh clone to a working personal job agent.

## 1. Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The agent runs with **zero** extra setup using the heuristic AI provider and the
bundled sample job source. PDF/DOCX parsing and the web dashboard need the
dependencies in `requirements.txt`.

## 2. Initialise

```bash
python -m job_agent.cli init
```

Creates the SQLite database (`job_agent/data/agent.db`) and the output folder.

## 3. Import your profile

The most reliable path is a JSON profile (see `examples/sample_profile.json`):

```bash
python -m job_agent.cli import-resume examples/sample_profile.json
python -m job_agent.cli profile
```

You can also import a real resume:

```bash
python -m job_agent.cli import-resume ~/Documents/my_resume.pdf   # or .docx / .txt
```

PDF/DOCX extraction is best-effort. Review the parsed profile with `profile`;
if anything is off, export your resume to JSON (mirroring the example) for full
control. **The agent never invents data** — what you import is what it uses.

## 4. Teach it your cover-letter voice

```bash
python -m job_agent.cli set-cover-style examples/sample_cover_letter.txt \
  --career-story "I started on the help desk because I love solving problems..." \
  --motivations "I want a team where I can grow into security."
```

## 5. Configure locations & roles

Edit `config.yaml`:

* `target_roles` — the job titles you want.
* `locations.regions` — your preferred suburbs (pre-filled for Western
  Melbourne / CBD / Richmond).
* `min_match_score` — how selective the daily report is.

## 6. Find and review jobs

```bash
python -m job_agent.cli search     # find & score
python -m job_agent.cli report     # today's opportunities
python -m job_agent.cli jobs       # all stored jobs, best first
```

## 7. Tailor documents for a job

```bash
python -m job_agent.cli tailor 3   # use a job id from `jobs`/`report`
```

Writes a tailored `resume.txt`, `cover_letter.txt` and `cover_letter_short.txt`
under `job_agent/data/applications/`.

## 8. Prepare an application (never auto-submitted)

```bash
python -m job_agent.cli apply 3
# add --headless to skip opening a browser and just get manual instructions
```

For browser automation install Playwright browsers once:

```bash
python -m playwright install chromium
```

## 9. Track progress

```bash
python -m job_agent.cli status 3 Applied --note "Applied via company site"
python -m job_agent.cli track
python -m job_agent.cli analytics
```

## 10. Web dashboard

```bash
python -m job_agent.cli serve     # http://127.0.0.1:8000
```

## Switching on an LLM (optional)

Edit `config.yaml`:

* **Local / private:** install [Ollama](https://ollama.com), pull a model
  (`ollama pull llama3.1`), set `ai.provider: ollama`.
* **Claude:** set `ai.provider: anthropic` and export `ANTHROPIC_API_KEY`.

If the LLM is unreachable the agent automatically falls back to its deterministic
templates, so the pipeline never breaks.

## Scheduled daily digest

`python -m job_agent.cli digest` runs a full daily pass (search → tailor the top
matches → report), writes a Markdown digest, and — if SMTP is configured —
emails it. Thunderbird is local-only, so a *server* schedule uses SMTP instead;
interactive use still drafts `.eml` files and never sends.

Run it locally:

```bash
python -m job_agent.cli digest --top 5 --out digest.md
```

To email it (e.g. from cron), set these environment variables:

| Variable | Purpose |
|---|---|
| `SMTP_HOST` | Mail server (required to email) |
| `SMTP_PORT` | Default `587` |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | Auth (use an app password) |
| `SMTP_USE_TLS` | `false` to disable STARTTLS (default on) |
| `DIGEST_TO` | Recipient (required to email) |
| `DIGEST_FROM` | From address (defaults to your profile email) |

Without `SMTP_HOST`/`DIGEST_TO` the digest is just written to disk.

### Run it automatically on GitHub

The bundled workflow `.github/workflows/daily-digest.yml` runs on a daily cron
(and on demand). Configure these **repository secrets** (Settings → Secrets and
variables → Actions):

* `RESUME_JSON` — your profile as JSON (kept private; see
  `examples/sample_profile.json` for the shape). If unset, the example profile
  is used.
* `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `DIGEST_TO` (and optionally
  `SMTP_PORT`, `DIGEST_FROM`) — to receive the email.

Without the SMTP secrets the workflow still runs and uploads `digest.md` as a
downloadable artifact. To use live jobs rather than the sample source, set
`search.sources` to include `rss` and list your feed URLs in `config.yaml`.
