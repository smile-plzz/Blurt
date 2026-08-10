# Frontend / Render Agent

Thin rendering layer over the JSON contracts (`schema/intent.json`, `schema/persona.json`, and the Orchestrator's reminder-plan output). No business logic about timing or tone belongs here.

## Status

`mockups/` has a 10-screen UI mockup set (Claude Design, Organic design system) covering onboarding, capture, home feed, check-in tone variants, Recovery Mode entry, and settings/privacy — grounded in the intent state machine, framing modes, and Recovery Mode spec from the Notion roadmap. Open `mockups/Blurt Mockups (standalone).html` directly in a browser to view; it's a mockup artifact, not implementation code.

`web/` is the first real scaffold: build-sequence step 2 (`AGENTS.md`) — a home feed plus **manually hand-triggered** `direct`/`inquiring` check-ins (radio toggle picks the framing; no automated moment/urgency/receptivity detection yet, that's step 4). Static HTML/CSS/JS, no build step, same pattern as `capture/web/`:

```
cd frontend/web && npx serve .
```

Reads/writes the same `blurt_intents_v0.1.0` localStorage key as Capture (same origin required to share data today — a real shared store is an Orchestrator-layer concern later). Handles all three `resolution_status` outcomes reachable from a check-in (`done`, `done_adjacent`, `no_longer_relevant`), plus `deferred`/`stalled` state transitions. `done_late` and `abandoned` aren't reachable from the UI yet — no timing/staleness logic exists here on purpose (that's the persona/inference layer's job in step 4).

## Surfaces to build

- **Capture confirmation** — as close to invisible as possible. This layer can quietly reintroduce the friction the Capture Agent worked to remove; treat every added tap/screen as a regression.
- **Check-in UI** — a genuine two-way surface matching the `resolution_status` enum (did it / didn't / did something adjacent / doesn't matter anymore), not a binary checkbox.
- **Reminder surface** — renders whatever the Orchestrator's structured JSON output specifies, generically, not hardcoded per problem type.

## Depends on

`schema/intent.json`, `schema/persona.json` (hard dependency — can't meaningfully start without at least a draft).
