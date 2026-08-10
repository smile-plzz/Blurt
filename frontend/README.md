# Frontend / Render Agent

Thin rendering layer over the JSON contracts (`schema/intent.json`, `schema/persona.json`, and the Orchestrator's reminder-plan output). No business logic about timing or tone belongs here.

## Status

Not started as code. `mockups/` has a 10-screen UI mockup set (Claude Design, Organic design system) covering onboarding, capture, home feed, check-in tone variants, Recovery Mode entry, and settings/privacy — grounded in the intent state machine, framing modes, and Recovery Mode spec from the Notion roadmap. Open `mockups/Blurt Mockups (standalone).html` directly in a browser to view; it's a mockup artifact, not implementation code. Can render against stub JSON as soon as schemas exist; upgrade to live data as other agents land.

## Surfaces to build

- **Capture confirmation** — as close to invisible as possible. This layer can quietly reintroduce the friction the Capture Agent worked to remove; treat every added tap/screen as a regression.
- **Check-in UI** — a genuine two-way surface matching the `resolution_status` enum (did it / didn't / did something adjacent / doesn't matter anymore), not a binary checkbox.
- **Reminder surface** — renders whatever the Orchestrator's structured JSON output specifies, generically, not hardcoded per problem type.

## Depends on

`schema/intent.json`, `schema/persona.json` (hard dependency — can't meaningfully start without at least a draft).
