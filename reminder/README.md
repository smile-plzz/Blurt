# Reminder & Tone Agent

Scheduling and follow-up logic. Flagged in the source doc as the single hardest design problem in the whole product — harder than the persona ML.

## Status

Not started. Prototype copy and timing before any backend scheduling logic.

## Core tension to protect

Too gentle -> ignorable noise that trains the user to dismiss reminders. Too persistent -> the nagging/shame machine the product exists to avoid. Resolve this in copy/timing tests before committing to defaults.

## Check-in flow

Resurface at a contextually smart moment -> "did you do it?" -> on a no, decide between re-scheduling and a softer follow-up. One miss is never treated as failure. Output must use the full `resolution_status` enum from `schema/intent.json`, not a binary.

## Copy variants

Track tone-tested reminder/check-in copy variants here as they're drafted and reacted to by real ADHD users. Note where the nagging threshold seemed to sit for early testers.

## Repair vs. channel switch

Open question from source doc: does a missed reminder need repair (apology-free re-ask), or does repeated ignoring signal a channel/timing switch? Record findings here.

## Depends on

`schema/intent.json`'s `resolution_status` field; Persona Agent's `inferred_patterns.best_reminder_windows` once available (stub with fixed intervals first).
