# Frontend / Render Agent

Thin rendering layer over the JSON contracts (`schema/intent.json`, `schema/persona.json`, and the Orchestrator's reminder-plan output). No business logic about timing or tone belongs here.

## Status

`mockups/` has a 17-screen UI mockup set (Claude Design) covering onboarding, capture, home feed, check-in tone variants, Recovery Mode entry, decomposition propose/approve, per-parent rollup check-in, Task detail, and (added 2026-08-13, the "UI/UX Refinement" polish pass) a resumable Settings persona-edit flow — grounded in the intent state machine, framing modes, Recovery Mode spec, and decomposition decisions from the Notion roadmap. Open `mockups/Blurt Mockups (standalone).html` directly in a browser to view; it's a mockup artifact, not implementation code.

**2026-08-13 reconciliation pass** brought `web/` in line with this mockup set's four resolved drifts:
- **Rollup check-in scope reverted to per-parent.** An earlier pass (2026-08-11) had merged all parents' pending subtasks plus unrelated resurfacing items into one global "catch-up" screen; the refined mockup explicitly retired that in favor of one parent, one pass ("Just this one. Anything else waits its turn.") — `app.js`'s `renderGlobalRollup` became `renderRollup`, scoped to the first parent with pending steps.
- **The "why am I being reminded now" transparency note is now its own disclosure** (`checkin-why-toggle`/`checkin-why` in `index.html`, `setCheckinWhy()` in `app.js`) — closed by default, no longer concatenated into the check-in body text.
- **Settings' "Edit" (restarted the ten-question onboarding from scratch) is now "Review"** (`review.html`/`review.js`), a resumable per-question flow: a list of what was already answered, tap one to change it with the prior answer pre-selected, everything else untouched. `QUESTIONS` moved out of `onboarding.js` into a shared `questions.js` so both files read the same source of truth.
- **Decomposition's checkbox+strikethrough subtask-removal interaction** was already correct in `app.js`'s round check-icon toggle — the mockup's own auto-generated sync notes (`github.md` in the Claude Design export) flagged it as still using delete-row buttons, which was stale; verified directly against `renderDecomposeProposal` and left unchanged.

Task detail's mockup grouping (flat list, day-chip tags, one pinned deadline prompt) still differs cosmetically from `task.js`'s current three-section-header/focused-card pattern — not reconciled this pass; the built version is functionally equivalent (one prompt surfaced at a time) and arguably clearer, so this is a lower-priority visual-only gap, not a behavior bug.

`web/` is the first real scaffold: build-sequence step 2 (`AGENTS.md`) — a home feed plus **manually hand-triggered** `direct`/`inquiring` check-ins (radio toggle picks the framing; no automated moment/urgency/receptivity detection yet, that's step 4). Static HTML/CSS/JS, no build step, same pattern as `capture/web/`:

```
cd frontend/web && npx serve .
```

Reads/writes the same `blurt_intents_v0.1.0` localStorage key as Capture (same origin required to share data today — a real shared store is an Orchestrator-layer concern later). Handles all three `resolution_status` outcomes reachable from a check-in (`done`, `done_adjacent`, `no_longer_relevant`), plus `deferred`/`stalled` state transitions. `done_late` and `abandoned` aren't reachable from the UI yet — no timing/staleness logic exists here on purpose (that's the persona/inference layer's job in step 4).

Step 3 is also scaffolded: a rule-based "not sure" fallback (`isAmbiguous`/`renderNotSure` in `app.js`) for the confusable moment pairs from the six-moments detection table — A/C (vague capture text, no named object) and B/E (`stall_count >= 2`, i.e. repeatedly stalled). When either rule trips, the check-in bypasses the direct/inquiring framing picker and asks directly ("still working on that, or something new?") instead of guessing. Both heuristics are starting guesses, not tuned against real capture data yet.

Step 4 MVP is scaffolded too: `openCheckin` now calls `/api/infer` (`api/infer.js`, a Vercel serverless function) first — "Option A" from the roadmap, one Mistral call per check-in returning moment + urgency + receptivity + framing together, plus a one-line "why am I being reminded now" transparency note appended to the check-in copy. If the call fails, times out, or `MISTRAL_API_KEY` isn't configured, it silently falls back to the step 2/3 rule-based/manual flow above — the app never breaks for lack of a key. **Requires `MISTRAL_API_KEY` set in the Vercel project's Environment Variables** (Settings → Environment Variables) — this isn't something Claude can set from here, since it's a secret. `receptivity` has no real interaction history to draw on yet (no persona store exists) and is expected to come back `"unknown"` until the Persona Agent's `interaction_log` exists.

## Product language system (2026-08-13)

A copy/UX audit found the same concept wearing five different words across screens, and several
build instruments shipping as product surface. One vocabulary now, used everywhere:

| Concept | Word | Retired |
|---|---|---|
| Finished it | **Done** | Completed, Resolved, "Just that bit" |
| Keep it, not now | **Not yet** (direct) / **Still on my mind** (inquiring, recovery) | "Still there", "Still is" |
| Stop caring about it | **Let it go** | "Drop it", "Archive", "no longer relevant" |
| Did it differently | **Did it another way** | "Something else happened", "Handled a different way" |
| Repeatedly postponed | **stuck** | "stalled", "stalled 3 times" |
| Broken-down pieces | **steps** | subtasks, decomposition |

State-machine names (`dormant`, `surfaced`, `deferred`, `stalled`, `flagged_for_recovery`) are
storage identifiers and never reach the UI — `stateLabel()` in `intents.js` is the single
translation point, and returns `null` for resting states so untagged *is* the resting state.

**`?dev=1`** reveals the build instruments: the manual `direct`/`inquiring` framing picker and the
decision-source readout (`mistral · <moment> · <urgency>` / the `MISTRAL_API_KEY` fallback notice).
Both used to render for everyone. Neither is product surface — they name a model vendor, the
internal taxonomy, and an env var.

## Surfaces to build

- **Capture confirmation** — as close to invisible as possible. This layer can quietly reintroduce the friction the Capture Agent worked to remove; treat every added tap/screen as a regression.
- **Check-in UI** — a genuine two-way surface matching the `resolution_status` enum (did it / didn't / did something adjacent / doesn't matter anymore), not a binary checkbox.
- **Reminder surface** — renders whatever the Orchestrator's structured JSON output specifies, generically, not hardcoded per problem type.

## Depends on

`schema/intent.json`, `schema/persona.json` (hard dependency — can't meaningfully start without at least a draft).
