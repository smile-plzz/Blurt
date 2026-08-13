# Reminder & Tone Agent

Scheduling and follow-up logic. Flagged in the source doc as the single hardest design problem in the whole product — harder than the persona ML.

## Status

MVP scaffolded (2026-08-13): `scheduler.js` implements timing (fixed-interval stub) and the
repair-vs-silent-recovery decision as pure, testable functions — no live trigger yet, since
this PWA has no push/background-notification channel to fire on (same native-shell gap as the
capture widget). **The genuinely hard part of this agent's brief — real tone/copy validated
against real ADHD user reactions, and where the nagging threshold actually sits — is still
open and cannot be completed by writing more code.** Treat `scheduler.js` as infrastructure
for that testing, not a substitute for it.

## Core tension to protect

Too gentle -> ignorable noise that trains the user to dismiss reminders. Too persistent -> the nagging/shame machine the product exists to avoid. Resolve this in copy/timing tests before committing to defaults. `scheduler.js`'s `DEFAULT_FOLLOWUP_DELAYS_MS` and `WINDOW_HOUR` are explicitly untuned starting guesses, not defaults to trust.

## Check-in flow

Resurface at a contextually smart moment -> "did you do it?" -> on a no, decide between re-scheduling and a softer follow-up. One miss is never treated as failure. Output must use the full `resolution_status` enum from `schema/intent.json`, not a binary. `scheduler.js`'s `decideFollowUpAction()` implements this: first check-in and repeats up to `schedule_hint.follow_up_count_max` are apology-free "repair" re-asks (no acknowledgment of the miss); past that, it folds into `silent_recovery_fold_in` instead of firing another active nudge.

## Copy variants

The in-app check-in copy (direct/inquiring) is already built — see `frontend/web/app.js`'s `framingCopy()`. What's still missing and still needs real ADHD users' reactions (source doc's explicit recommendation: ask what the best/worst reminder they've ever received was, don't guess): push/notification-surface copy, since no notification channel exists to test it against yet, and the two framing modes named in `schema/persona.json` (`activation-only`, `silent-recovery`) that aren't implemented in the UI at all.

## Repair vs. channel switch

Design answer given (Notion roadmap, 2026-08-10, mirrored in `AGENTS.md`'s superseding sequence note and `OPEN_QUESTIONS.md` item 10): repeated ignoring means a receptivity-driven switch to silent-recovery framing, not an escalating per-item repair loop. `scheduler.js`'s `decideFollowUpAction()` is that answer as code. **Still "partial," not "answered," in `OPEN_QUESTIONS.md`** — needs real-use validation before the threshold (currently `schedule_hint.follow_up_count_max`, default 2) is trusted.

## Depends on

`schema/intent.json`'s `resolution_status` field (done); the Orchestrator's `schedule_hint` output (done, `api/orchestrator.js`); Persona Agent's `inferred_patterns.best_reminder_windows` once available (still stubbed with fixed intervals — `scheduler.js`'s `WINDOW_HOUR` map — since `inferred_patterns` is still empty).
