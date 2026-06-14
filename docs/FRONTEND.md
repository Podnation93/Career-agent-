# JobPilot — Frontend Page & Component Plan

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn-style primitives.
Server Components fetch data; Client Components handle interactivity (filters, kanban DnD).

## Design language
- Clean, dense, "operator dashboard" feel. Left sidebar nav, top bar with global actions.
- Colour-coded statuses and score badges (green ≥75 / amber 50–74 / grey <50).
- Light + dark mode. Accessible (focus rings, ARIA, keyboard nav).

## Global layout (`app/layout.tsx`)
- `<Sidebar>`: Dashboard, Jobs, Tracker, Import, Documents, Profile, Settings.
- `<TopBar>`: search, "Import job" button, Gmail status pill, theme toggle, user menu.
- `<Toaster>` for notifications.

## Pages

### `/` Dashboard
Overview cards (from `/api/dashboard/summary`): **New jobs**, **Good matches**,
**Applications submitted**, **Interviews**, **Follow-ups due**. Below: "Top matches"
list (highest score, status=new/to_review) and "Reminders due" list.

### `/jobs` Jobs list
- `<JobFilters>` (client): location, source, score range, salary, work type, status, company, skills, date.
- `<JobSort>`: highest match / newest / closest location / highest salary / easiest to apply.
- `<JobTable>` rows → title, company, location, source, score badge, status chip, apply link, found date. Row click → detail.
- Pagination + URL-synced filter state (searchParams).

### `/jobs/[id]` Job detail
- Header: title, company, location, work type, salary, source link, status selector.
- `<ScorePanel>`: big score, recommendation badge, category breakdown bars, reason.
- `<SkillsPanel>`: matched (green) vs missing (amber) skills, risks.
- `<StrategyPanel>`: resume strategy, cover-letter angle, interview talking points.
- `<DocumentsPanel>`: generate/list resume notes, cover letter, screening answers; export.
- `<NotesPanel>` + `<Timeline>` (application_events).
- **`<ApplyButton>`**: `<a href={apply_url || source_url} target="_blank" rel="noopener noreferrer">Apply on original site</a>`. On click → `<ApplyDialog>`: "Did you apply?" → Mark Applied / Not Applied / Set reminder / Add note. Posts `opened_apply` then the chosen event.

### `/import` Import
- Tabs: **Manual** (paste URL / paste text / upload txt/PDF) and **Gmail**.
- Manual: form → `POST /api/import/manual`, shows parsed preview + duplicate warning.
- Gmail: connect/disconnect, editable search queries, "Scan now", live progress + recent imports (`/api/import/status`).

### `/tracker` Tracker
- `<KanbanBoard>` columns = statuses; drag a card → `PATCH /api/jobs/:id/status` (+ event).
- Toggle to `<TrackerTable>` view. Cards show title, company, score, days-in-status, reminder flag.

### `/documents` Documents
- List of generated docs across jobs, filter by kind/job, preview, export, delete.

### `/profile` Resume profile
- Edit headline, summary, skills (chips with level/years), experience, target roles,
  target locations, remote/hybrid/CBD toggles, salary goals, career goals.
- Manage base resume(s) + cover-letter templates.

### `/settings` Settings
- AI provider (heuristic/anthropic/openai) + model; Gmail connection; location prefs;
  scoring weights sliders (skills/experience/location/growth/effort); privacy:
  **Disconnect Gmail**, **Delete all my data** (password-confirmed).

### `/login` Auth
- Email/password login + register. Redirects to dashboard.

## Reusable components
`ui/` (Button, Card, Badge, Dialog, Input, Select, Slider, Tabs, Table, Toast — shadcn-style),
`jobs/` (JobCard, ScoreBadge, StatusChip, SkillPill, ScorePanel, ApplyButton, ApplyDialog),
`tracker/` (KanbanBoard, KanbanCard), `layout/` (Sidebar, TopBar, ThemeToggle),
`forms/` (ProfileForm, ImportForm, FilterBar).

## Data fetching
- `src/lib/api.ts`: typed fetch wrapper using shared DTO types; sends cookies; throws typed errors.
- Server Components call the API directly server-side; mutations from Client Components via the wrapper, then `router.refresh()` or optimistic update.
