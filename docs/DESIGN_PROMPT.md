# Design brief — CareerAgent

> Paste everything between the lines into your design tool (Figma / Claude
> design). It's written to be read as-is — a person briefing a designer.

---

I'm building a personal web app called **CareerAgent**. Think of it as a quiet,
well-made assistant that takes the grind out of job hunting. It doesn't apply to
anything for me and it never sends or posts anything on my behalf — all it does
is *find* the right jobs and get my application materials ready, so the only
thing left for me to do is click through and apply myself.

Here's the idea in plain terms.

The app already knows me. I upload my resume and a cover letter once, and it
reads them properly — my real experience, my skills, the way I write. From then
on it does the searching I'd otherwise be doing by hand: it watches **Seek** and
**Indeed**, and it reads the **job-alert emails and mailing lists** I've
subscribed to. Everything it finds lands in one clean place, so I'm not living
in fifteen browser tabs. It only reads and gathers — it doesn't log in as me or
submit anything anywhere.

It only cares about where I actually want to work — **Western Melbourne, the
Melbourne CBD and Richmond**, plus the nearby suburbs — and it's happy with
remote and hybrid roles too. Anything well outside that gets quietly filtered
down rather than cluttering the list. Every job it surfaces comes with a simple,
honest read on how well it fits me and why, so I can trust the shortlist instead
of second-guessing every line.

When I open a job I like, it does the genuinely useful part: it rewrites my
resume and cover letter for that specific role. Not invented experience, not
robotic keyword-stuffing — it keeps everything true to what I've actually done,
just reframed so the most relevant parts lead and it reads like a real,
confident person wrote it. I can edit anything, download it, then head to the
original listing and apply myself.

So the whole point is simple: it kills the boring, repetitive searching and the
blank-page dread of tailoring documents — but I stay in the driver's seat and do
the applying.

## What it should feel like
Calm, premium and trustworthy. This thing handles my resume and my career, so it
should feel more like a thoughtful personal tool than a loud job board. Lots of
breathing room, soft depth, a confident accent colour (a deep, friendly blue),
and a beautiful dark mode as well as light. Nothing should feel spammy or
"growth-hacky". When in doubt, quieter and more considered.

## The screens I need

**Getting set up.** A warm, short onboarding: drop in my resume (PDF, Word or
text) and watch it get read, then see a tidy summary of what it understood —
my roles, skills and certifications — that I can correct. Same for my cover
letter, so it learns my voice. Then I set my locations (pre-filled with my
Melbourne suburbs), the kinds of roles I'm after, and connect the places jobs
come in: Seek, Indeed, and my email / mailing-list alerts.

**Home / today.** The first thing I see each day: a short, ranked list of the
best new matches — not hundreds, just the ones worth my attention. Each one
shows the title, company, where it is (with a clear fit badge), the salary if
it's listed, a one-line "why this suits you", and a fit score. From here I can
open it, save it for later, or dismiss it.

**All jobs / search.** Everything that's been found, with gentle filters —
location and remote/hybrid, role, salary, how good the match is, how recent it
is — and a way to see which source each came from (Seek, Indeed, an email
alert). It should make it obvious these are pulled in for me automatically.

**Job detail — the hero screen.** The full posting on one side. On the other, a
clear picture of fit: an attractive score, a little breakdown (skills,
experience, location, room to grow), the requirements I already meet, the gaps
to be aware of, and a plain-English verdict. Below that, the part that matters
most: my **tailored resume and cover letter** for this exact role, shown as a
clean preview I can read and edit, with a quiet reassurance that nothing has
been invented — it's all true to my real history. Then a big, obvious
**"Open on Seek / Indeed to apply"** button, because I'm the one who applies.

**Tailoring view.** A focused space to fine-tune the tailored resume and cover
letter — light editing, a "make this stronger" assist, and a download. It should
feel like a calm writing room, and it should keep versions per job so I can come
back.

**Saved & applied.** A simple, satisfying place to track things I care about:
jobs I've shortlisted, and ones I've marked as applied (I tick that myself,
since the app doesn't apply for me). A little sense of momentum — how many I've
saved, applied to, heard back on — without turning into a heavy CRM.

**Settings.** My resume and cover letter, my preferred locations (as friendly
suburb chips), my target roles, and the connections that feed jobs in — Seek,
Indeed, and which email accounts / mailing lists to read. Plus a quiet,
reassuring note about privacy: my data stays mine, and the app only ever reads
and prepares — it never applies or sends anything.

## Make it genuinely beautiful
Aim for flagship, award-worthy craft — the polish of something like Linear, Arc
or Superhuman — while staying obvious to use. The fit score should be a small
hero moment: a gorgeous animated ring with the sub-scores easing into place when
a job opens. Use soft, real shadows and a faint, tasteful gradient glow in the
headers and empty states. Motion should be smooth and physical — cards lift on
hover, numbers count up, things settle rather than snap — and it should respect
reduced-motion. Real type hierarchy, a tidy spacing rhythm, crisp icons, and
thoughtful empty and loading states everywhere. Use realistic Melbourne job
content throughout, never lorem ipsum. The dark theme should feel especially
premium — a deep near-black with the blue accent glowing gently.

## What to hand back
High-fidelity desktop layouts for every screen above, mobile views for the home
list and the job detail, and light + dark versions of home and job detail.
A small component sheet too: the job card, the fit-score ring and breakdown, the
location badge, the source tag, the tailored-document preview, the upload
dropzone, the stats strip, the filter bar, and the empty/loading states.

Above all: make it feel like a premium, trustworthy product a real person would
happily hand their resume to — beautiful, calm, and genuinely useful.

---

_Note for the build (not for the designer): pulling listings from Seek/Indeed
directly is against their terms, so when we wire this up the live data will come
through compliant routes — official/partner feeds, the subscribed job-alert
emails already supported by the Gmail read-only import, and RSS — while the
screens look exactly as designed._
