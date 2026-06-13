"""Learning system / analytics.

Looks across tracked applications to surface what's working: response rate,
which match-score bands and which job keywords correlate with getting a response
(Interview / Offer). The insights feed back into prioritising future jobs.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from ..db import Database
from ..models import ApplicationStatus


@dataclass
class AnalyticsReport:
    total: int = 0
    applied: int = 0
    responses: int = 0
    response_rate: float = 0.0
    interviews: int = 0
    offers: int = 0
    rejected: int = 0
    avg_score_response: float = 0.0
    avg_score_no_response: float = 0.0
    top_response_keywords: list[tuple[str, int]] = field(default_factory=list)
    insights: list[str] = field(default_factory=list)


class Analytics:
    def __init__(self, db: Database):
        self.db = db

    def compute(self) -> AnalyticsReport:
        apps = self.db.list_applications()
        report = AnalyticsReport(total=len(apps))
        if not apps:
            report.insights.append("No applications tracked yet — run a search and tailor a few jobs.")
            return report

        responded_scores: list[int] = []
        silent_scores: list[int] = []
        keyword_counter: Counter[str] = Counter()

        for app in apps:
            if app.status == ApplicationStatus.APPLIED.value or app.date_applied:
                report.applied += 1
            if app.status == ApplicationStatus.INTERVIEW.value:
                report.interviews += 1
            if app.status == ApplicationStatus.OFFER.value:
                report.offers += 1
            if app.status == ApplicationStatus.REJECTED.value:
                report.rejected += 1

            if app.got_response:
                report.responses += 1
                responded_scores.append(app.match_score)
                job = self.db.get_job(app.job_id)
                if job:
                    keyword_counter.update(job.requirements_met)
            elif app.date_applied:
                silent_scores.append(app.match_score)

        report.response_rate = round(
            100 * report.responses / max(report.applied, 1), 1
        )
        report.avg_score_response = round(
            sum(responded_scores) / len(responded_scores), 1
        ) if responded_scores else 0.0
        report.avg_score_no_response = round(
            sum(silent_scores) / len(silent_scores), 1
        ) if silent_scores else 0.0
        report.top_response_keywords = keyword_counter.most_common(8)

        report.insights = self._insights(report)
        return report

    def _insights(self, r: AnalyticsReport) -> list[str]:
        out: list[str] = []
        if r.applied == 0:
            out.append("Nothing applied yet — tailor and apply to your top matches.")
            return out
        out.append(f"Response rate so far: {r.response_rate}% ({r.responses}/{r.applied}).")
        if r.avg_score_response and r.avg_score_no_response:
            if r.avg_score_response > r.avg_score_no_response + 5:
                out.append(
                    "Higher-scoring jobs get more responses — keep prioritising "
                    f"matches above ~{int(r.avg_score_response)}."
                )
        if r.top_response_keywords:
            kws = ", ".join(k for k, _ in r.top_response_keywords[:5])
            out.append(f"Skills that show up in responsive applications: {kws}. "
                       "Lead with these in your resume and cover letters.")
        if r.offers:
            out.append(f"🎉 {r.offers} offer(s) recorded.")
        return out
