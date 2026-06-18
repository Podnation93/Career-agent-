# JobPilot — AI Prompt Plan

All AI calls go through `packages/core/ai` behind a `ChatProvider` interface
(`anthropic` | `openai` | `heuristic`). Default model: `claude-sonnet-4-6`.

## Global rules (system preamble for every prompt)
```
You are JobPilot's analysis engine for a single job seeker.
RULES:
- Never invent experience, skills, certifications, or employment the user does not have.
- Clearly separate FACTS (present in the provided profile/job) from ASSUMPTIONS or SUGGESTIONS.
- When information is missing or ambiguous, say so and lower your confidence — never guess silently.
- Output ONLY valid JSON matching the requested schema. No prose outside JSON.
- Include a "confidence" (0–1) and a "warnings" array when data is incomplete.
- You assist with applying manually; you never submit anything.
```
Every prompt is **versioned** (`promptVersion` stored on `job_scores.raw_response` /
`generated_documents.metadata`) so outputs are reproducible and auditable. Each call
validates the model's JSON against a Zod schema and **falls back to the heuristic engine**
on parse/validation failure.

## P1 — Extract structured job data
Input: raw email/job text (+ optional URL). Output:
```json
{ "title": "", "company": "", "location": "", "workType": "onsite|hybrid|remote|unknown",
  "salaryMin": null, "salaryMax": null, "salaryText": "", "applyUrl": null,
  "sourceUrl": null, "closingDate": null, "requiredSkills": [], "summary": "",
  "confidence": 0.0, "warnings": [] }
```
Instruction: extract only what's present; null unknowns; never fabricate a salary or URL.

## P2 — Score a job against the profile
Input: profile (skills, experience, target roles/locations, goals) + job (title, description,
location, skills) + scoring weights. Output (matches `job_scores`):
```json
{ "score": 0, "recommendation": "apply|consider|skip", "reason": "",
  "categoryScores": { "role": 0, "skills": 0, "location": 0, "experience": 0, "salary": 0, "effort": 0 },
  "matchedSkills": [], "missingSkills": [], "transferableSkills": [], "risks": [],
  "resumeStrategy": "", "coverLetterAngle": "", "interviewPoints": [],
  "confidence": 0.0, "warnings": [] }
```
Scoring rubric (also encoded in the heuristic): role fit (target-role match, seniority
penalty for too-junior/too-senior), skills fit (required vs profile, transferable),
location fit (Melbourne regions > good suburbs > remote/hybrid > poor), experience fit
(penalise excessive YOE asks; favour entry cyber/support), salary & progression (step-up?
supports security path?), application effort (easy-apply vs long form).

## P3 — Tailored resume changes
Input: base resume + job + P2 result. Output:
```json
{ "tailoredSummary": "", "bulletSuggestions": [{ "original": "", "suggested": "", "rationale": "" }],
  "keywordsToInclude": [], "doNotClaim": [], "confidence": 0.0, "warnings": [] }
```
`doNotClaim` lists skills the job wants but the profile lacks (e.g. "Do not claim Splunk
unless you actually have it — mention cybersecurity study instead").

## P4 — Cover letter
Input: profile + job + P2 angle + chosen template/tone. Output:
```json
{ "coverLetter": "", "shortMessage": "", "usedFacts": [], "flaggedGaps": [],
  "confidence": 0.0, "warnings": [] }
```

## P5 — Screening question answers
Input: profile + job + list of screening questions. Output:
```json
{ "answers": [{ "question": "", "answer": "", "basedOnProfile": true, "gap": null }],
  "confidence": 0.0, "warnings": [] }
```
If an answer would require fabrication, set `basedOnProfile=false` and describe the `gap`.

## P6 — Missing-skills summary
Input: profile + several jobs' required skills. Output: prioritised upskilling list with why
and which roles it unlocks. JSON array `[{skill, frequency, unlocksRoles[], suggestedResource}]`.

## P7 — Duplicate detection (assist)
Primary dedupe is deterministic (canonical URL, title+company+location, text hash). The LLM
is only a tie-breaker for near-duplicates: input two jobs → `{ "duplicate": true|false, "confidence": 0.0, "reason": "" }`.

## P8 — Role categorisation
Input: title + description → `{ "category": "it_support|service_desk|app_support|erp_support|sql_support|soc|cybersecurity|systems|other", "seniority": "junior|mid|senior", "confidence": 0.0 }`.

## P9 — Application priority suggestion
Input: list of scored jobs → ordered `[{ jobId, priority, reason }]` factoring score, closing
date proximity, and application effort.

## Prompt engineering notes
- Use few-shot only for P1 (extraction) where format variance is high.
- Temperature low (0–0.3) for extraction/scoring/dedupe; slightly higher (0.5) for cover letters.
- Always pass profile as structured JSON, not prose, to reduce hallucination.
- Token caps per call; log prompt version + token usage (never log PII content) for cost tracking.
