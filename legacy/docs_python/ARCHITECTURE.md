# Architecture

This document describes the design of the Personal AI Job Application Agent: the
components, how data flows between them, and the principles that shaped them.

## Design principles

1. **Quality over quantity.** The agent surfaces a small set of well-matched
   jobs, not hundreds. The default `min_match_score` filters out noise.
2. **Truthful by construction.** Nothing in the resume/cover-letter pipeline can
   invent skills or experience — generators only re-order, re-point and surface
   what the imported profile genuinely contains.
3. **Human in the loop.** The agent prepares applications but never sends or
   submits on its own. Applying is approval-gated: `request_apply` parks a
   prepared application in the `AwaitingApproval` state with a stored plan, and
   nothing leaves until `approve_apply` is triggered by a human (e.g. accepting
   the phone push the agent sends). Final send/submit is always a human action.
4. **Runs anywhere, with or without an LLM.** A deterministic heuristic engine
   powers matching and document generation out of the box; an LLM (local Ollama
   or Anthropic Claude) can be plugged in for higher-quality writing.
5. **Privacy first.** All data lives in a local SQLite database. The default AI
   provider makes no network calls.

## Components

| Layer | Module | Responsibility |
|---|---|---|
| Config | `config.py` | Load `config.yaml` (locations, roles, AI, thresholds) |
| Persistence | `db.py`, `models.py` | SQLite schema + dataclasses |
| Profile memory | `profile/` | Resume parsing, skill extraction, cover-letter style |
| AI provider | `ai/` | Pluggable text generation (heuristic / ollama / anthropic) |
| Search engine | `search/` | Source adapters (sample + scaffolds for Seek/LinkedIn/Indeed) |
| Location filter | `location/` | Suburb → Excellent/Good/Poor; remote/hybrid rules |
| Matching | `matching/` | 0-100 score across skills/experience/location/growth |
| Optimiser | `optimiser/` | Tailored resume + short/full cover letters |
| Automation | `automation/` | Playwright prep (never submits) |
| Tracker | `tracker/` | Application lifecycle |
| Analytics | `analytics/` | Response-rate learning |
| Reports | `reports/` | Daily opportunities report |
| Orchestration | `service.py` | `JobAgent` — single entry point |
| Interfaces | `cli.py`, `web/` | CLI + FastAPI dashboard |

## Data flow

```
import-resume ─▶ Profile (SQLite)
                    │
search ─▶ adapters ─▶ Job[] ─▶ LocationFilter ─▶ MatchScorer ─▶ jobs (SQLite)
                                                                    │
                                                            Tracker registers (Found)
                                                                    │
tailor <id> ─▶ ResumeOptimiser + CoverLetterGenerator ─▶ files + Tracker (Preparing)
                                                                    │
apply <id>  ─▶ ApplicationAutomator (prepare only) ─▶ human submits
                                                                    │
status <id> ─▶ Tracker (Applied/Interview/Offer/Rejected)
                                                                    │
analytics ──▶ response-rate insights ──▶ feeds future prioritisation
```

## Scoring model

Overall score is a weighted blend (see `matching/scorer.py`):

| Component | Weight | How it's computed |
|---|---|---|
| Skills | 40% | Overlap between job-detected skills and profile skills |
| Experience | 25% | Title alignment with target roles + depth of history |
| Location | 25% | Excellent (100) / Good (70) / Poor (20) from the filter |
| Growth | 10% | Seniority + development/progression signals in the ad |

The breakdown is stored per-job so the candidate always sees *why* a job ranked
where it did. The weights and the no-keyword neutral score are configurable
under `matching:` in `config.yaml`; the ATS resume length window lives under
`ats:`. Skills are detected once per `Job` (`Job.skills_detected()`, cached) and
reused by the scorer, ATS check and both document generators.

## Extending the search

Real job boards are deliberately scaffolds because scraping them generally
violates their Terms of Service. To add a live source:

1. Create `search/<name>.py` with a class exposing `name` and
   `search(roles, limit) -> list[Job]`.
2. Register it in `search/base.py::get_adapters`.
3. Add its name to `search.sources` in `config.yaml`.

Use a compliant data source (official/partner API, your own saved-search email
alerts, RSS, or manual exports) and respect each site's ToS and `robots.txt`.
