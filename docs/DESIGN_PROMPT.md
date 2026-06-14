# Design prompt — paste into Claude (design / design-to-code)

> Copy everything inside the horizontal rules below into Claude's design tool.

---

You are a senior product designer. Design a polished, modern, high-fidelity
**responsive web app** (desktop-first, with a mobile companion view) for a
product called **"CareerAgent" — a personal AI job-application assistant**.

## Who it's for
A job seeker in Melbourne, Australia (IT / cybersecurity, but the product is
general). Their goal is **quality over quantity**: find a small number of
well-matched roles, tailor their documents, and apply with minimal effort —
without ever losing control of what gets submitted.

## Product principles to express in the UI
- **Trustworthy & calm.** It handles someone's career and personal data. No
  spammy "apply to 500 jobs" energy.
- **Human-in-the-loop.** The agent prepares everything but the user approves
  before anything is submitted. Make approval feel effortless and safe.
- **Truthful.** Tailored resumes never invent skills — surface this reassurance.
- **Explainable.** Every match shows *why* it scored the way it did.

## Brand / visual style
- Clean, professional, confident. Light mode default with a dark mode.
- Primary accent: a trustworthy blue (~#2F6BFF). Success green, warning amber,
  danger red for status. Generous white space, rounded-12px cards, soft shadows.
- Typography: a modern sans (e.g. Inter) for UI; clear hierarchy.
- A small location badge system: **Excellent / Good / Poor** (green / amber /
  grey) shown on every job.
- A circular **Match Score 0–100** ring component with a four-part breakdown.

## Core screens to design (high fidelity)

1. **Onboarding / Resume upload**
   - Drag-and-drop upload for a resume (PDF / DOCX / TXT). Show parsing progress,
     then a confirmation card listing what was extracted (name, work history,
     skills, certifications) with an "edit / confirm" step. Emphasise "we only
     use what's in your resume — nothing invented."
   - Capture cover-letter style (upload a sample or pick a tone), preferred
     locations (pre-filled: Western Melbourne, Melbourne CBD, Richmond + nearby
     suburbs), and target job titles.

2. **Dashboard (home)**
   - "Today's matches" — a ranked list/grid of 5–8 job cards above a score
     threshold. Each card: title, company, location + match badge, salary,
     Match Score ring, a one-line "why it fits", and quick actions
     (Tailor, Apply, Save, Dismiss).
   - A compact stats strip: Applied, Responses, Response rate, Interviews,
     Offers. A "Daily digest" toggle.

3. **Job search / feed**
   - Source toggles: **Indeed, Seek, Company pages, RSS**. Filters: location
     (suburbs + Remote/Hybrid), role, salary, match-score slider, date posted.
   - Results as cards with the same components as the dashboard; sort by match.

4. **Job detail (the hero screen)**
   - Left: full job description, company, salary, location with match badge,
     link to original posting.
   - Right rail: **Match Score ring** + breakdown bars (Skills %, Experience %,
     Location %, Career growth %), "Requirements you meet", "Gaps to address",
     and a clear recommendation chip (Strong match / Worth applying / Skip).
   - Tabs/section for **Tailored documents**: a side-by-side preview of the
     tailored Resume and Cover letter (short + full), each with an **ATS score**
     gauge and a list of improvement suggestions. Buttons: Regenerate, Edit,
     Download (PDF), and **Apply**.

5. **Apply flow (two modes)**
   - **Click-to-apply:** user clicks Apply on a job → a review modal shows the
     exact resume + cover letter + form fields that will be submitted →
     "Submit application" (the user confirms). Show an explicit "Nothing is sent
     until you approve" reassurance.
   - **Auto-apply (automation):** a toggle/rules screen where the user sets
     criteria (min match score, locations, roles, max applications/day). When
     the agent finds a qualifying job it prepares the application and sends the
     user a **phone push notification**; design that mobile approval card with
     full details and big **Approve / Reject** buttons. Approving submits.
   - A persistent, clear **"Awaiting your approval"** queue.

6. **Application tracker**
   - A Kanban board with columns: **Found → Preparing → Applied → Interview →
     Rejected / Offer**. Cards show company, role, location, match score, date,
     and which resume/cover-letter version was used. Also offer a table view.

7. **Document studio**
   - An editor for a tailored resume + cover letter with a live **ATS panel**
     (keyword coverage, sections present, length, suggestions) and an AI
     "improve" action. Version history per job.

8. **Automation & schedule settings**
   - Auto-apply rules (above), a daily-digest schedule, the approval method
     (phone push / email), and a safety summary ("the agent will never submit
     without your approval").

9. **Analytics / insights**
   - Response rate over time, which skills/keywords correlate with responses,
     best-performing resume versions, applications by status. Friendly, not
     overwhelming.

10. **Settings**
    - Profile & resume, preferred locations (map/suburb chips), target roles,
      **job sources** (Indeed/Seek/RSS connect), AI provider (Local model /
      Claude / built-in), notification + email (SMTP) for digests, privacy
      ("your data stays yours").

## Components to include in the design system
Job card, Match Score ring + breakdown bars, location match badge, ATS gauge,
status pill, approval card (desktop + mobile push), document preview pane,
upload dropzone, stats strip, filter bar, Kanban column/card, empty states, and
loading/skeleton states.

## Make it amazing (this is the bar — not a generic dashboard)
This should look like a flagship, award-worthy product (think Linear, Arc,
Raycast, Vercel, Superhuman level of craft), while staying genuinely usable.

- **Signature hero moment:** the **Match Score** is the star. Make it a gorgeous
  animated radial gauge with a subtle gradient sweep and the four sub-scores
  fanning out; it should feel alive when a job loads.
- **Depth & light:** layered cards with soft, realistic shadows; a faint
  gradient mesh / aurora in the header or empty states; subtle glassmorphism on
  overlays — tasteful, never noisy.
- **Motion:** smooth, physics-based micro-interactions — cards lift on hover,
  numbers count up, the score ring animates in, the Kanban cards drag with
  spring physics, the approval card slides in. Page transitions are fluid.
  Respect reduced-motion preferences.
- **Delightful data-viz:** the analytics and ATS gauges should be genuinely
  beautiful (animated bars, sparkline trends), not stock chart widgets.
- **A "wow" automation view:** when auto-apply is running, show a calm, premium
  "agent at work" state — a live activity feed of what the agent is doing
  (found → matched → tailored → awaiting approval), with elegant status
  animations. It should feel like a capable assistant working for you.
- **Pixel-perfect details:** consistent 4/8px spacing grid, crisp iconography,
  thoughtful empty/loading/skeleton states, accessible contrast (WCAG AA),
  beautiful typography with real hierarchy. Every screen should look finished.
- **Cohesive theme:** a refined light theme and a stunning dark theme (deep
  near-black with the blue accent glowing). Make the dark mode feel premium.

Prioritise both **beauty and function** — it must be visually stunning *and*
obvious to use. No placeholder lorem-ipsum vibes; use realistic Melbourne job
content throughout.

## Deliverables
- Desktop layouts for all screens above, plus mobile views for Dashboard, Job
  detail, and the **push approval** card.
- A light and dark variant of the Dashboard and Job detail.
- A short component sheet (the design-system pieces listed above).

Make it feel like a premium, modern SaaS product a person would trust with
their job search — beautiful, functional, and something genuinely amazing.

---
