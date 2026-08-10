This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Blurt — "just blurt it out." Voice-first intent-capture companion for ADHD users, not a todo app.
Captures a fleeting intention the instant it forms and uses a per-user persona to decide when/how to
gently resurface it. Currently a multi-agent build with one piece implemented (Capture) and the rest
scaffolded as spec-only folders. Read `blurt-concept.md` (product rationale) and `AGENTS.md` (who
builds what, build order) before making structural changes — they're the spec of record for *why*
and *who builds what*, respectively.

**Product roadmap source of record:** the Notion page
[`Blurt - "just blurt it out"`](https://app.notion.com/p/Blurt-just-blurt-it-out-3b446f62ebad807f9bdbf6a9d46e70ff)
is where Ismail does ideation and drives product direction — check it before proposing new scope or
structural changes, not just the files in this repo. It has a "Product Development Roadmap" section
with live build status per agent and a running list of open questions. When work here raises a
product decision that isn't yours to make, add the question to that Notion section (don't just ask
inline in the repo) so it's visible where Ismail actually works. Keep `OPEN_QUESTIONS.md` and the
Notion questions in sync when either changes.

## Commands

Capture Agent prototype (`capture/web/`) is static HTML/CSS/JS, no build step, no dependencies:

```
cd capture/web && npx serve .
```

Open the served URL in Chrome/Edge (Web Speech `SpeechRecognition` support required for voice
capture; Safari support is partial). No tests, no lint — none set up yet.

No other agent (schema aside) has runnable code yet.

## Architecture

- `schema/intent.json`, `schema/persona.json` — versioned JSON Schema, source of truth for the data
  shape every other agent reads/writes. `schema/SCHEMA.md` documents field ownership.
- `capture/web/` — the only implemented agent. `app.js` is the whole app: `saveIntent(text, method)`
  writes an `intent.json`-shaped object straight to `localStorage` (key `blurt_intents_v0.1.0`), no
  intermediate processing. `SpeechRecognition` (voice) and a plain `<form>` (typed fallback) both
  call it. Nothing else consumes this store yet — Persona/Reminder/Orchestrator agents are unbuilt.
- `persona/`, `reminder/`, `frontend/`, `orchestrator/` — each just a `README.md` describing scope
  and status (`Not started`), no code.
- `PRIVACY.md` — storage-boundary decision (local-first, draft) and the one live exception already
  found: Chrome/Edge's `SpeechRecognition` sends raw audio to the vendor's server, not on-device.
- `OPEN_QUESTIONS.md` — living checklist of the source doc's unanswered validation questions, owned
  by QA Agent (not yet staffed).

## Conventions to preserve when editing

- **Capture stays dumb.** `capture/web/app.js` must never gain analysis/categorization logic — that
  belongs to the Persona Agent reading the `localStorage` store, not to capture itself. This is a
  named design principle in `AGENTS.md`, not just current scope.
- **`resolution_status` is a 6-value enum, never a boolean.** (`unresolved`, `done`, `done_late`,
  `done_adjacent`, `no_longer_relevant`, `abandoned`.) Collapsing it back to done/not-done blunts the
  whole point of the persona's `inferred_patterns` per the source doc's explicit flag.
- **Schema changes bump `schemaVersion`** (`schema/intent.json`, `schema/persona.json`) and need a
  migration note before shipping — see `schema/SCHEMA.md`'s versioning section. Don't silently
  reshape either file.
- **No cross-user persona pooling, ever.** Each user's persona is isolated by design; don't add any
  aggregation/analytics path that reads across users even for debugging.
- **Do not let the product regress into a generic task manager.** If a change starts looking like a
  todo app (rigid due dates, binary done/not-done, generic reminders), stop — re-read
  `blurt-concept.md`'s "trap to avoid" section before continuing.
