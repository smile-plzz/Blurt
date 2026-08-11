# Open Questions

Living checklist owned by the QA & Validation Agent. Source: `blurt-concept.md`'s validation-question sections. Status: `open` / `partial` / `answered`. Update as agents ship, don't wait for a launch-week pass.

## Core problem validation

| # | Question | Status |
|---|---|---|
| 1 | Is "intent decay" a distinct, common failure mode across ADHD subtypes, or mostly inattentive-type specific? | open |
| 2 | How long is the actual gap between intent formation and acting/forgetting? Minutes? Hours? | open |
| 3 | What non-app workarounds already work (sticky notes, phone reminders, telling someone)? What does this need to beat? | open |
| 4 | Do non-ADHD people also experience intent decay? Does that broaden the market or dilute the ADHD-specific angle? | open |

## Capture mechanism

| # | Question | Status |
|---|---|---|
| 5 | Is voice really lowest-friction in the moment, or does self-consciousness (speaking aloud around others) block it? | open |
| 6 | Real dropout point: failure to capture at all, vs. capturing but then ignoring/distrusting the reminder? | open |
| 7 | How accurate does transcription need to be before errors themselves become a frustration source? | open |

## Reminder / follow-up design

| # | Question | Status |
|---|---|---|
| 8 | What does "gentle" actually look like, per real ADHD users' own description (best/worst reminder they've received)? | open |
| 9 | Where's the helpful-nudge-to-nagging threshold, and does it shift by time of day, task type, or mood? | partial — design answer given (urgency/receptivity/framing decomposed as independent, tunable inputs), still needs real-use validation |
| 10 | Does a missed reminder need repair (apology-free re-ask), or does repeated ignoring mean switch channel/timing? | partial — design answer given (repeated ignoring -> receptivity-driven switch to `silent-recovery` framing, no per-item repair loop), still needs real-use validation |

## Persona / personalization

| # | Question | Status |
|---|---|---|
| 11 | How many interactions before a persona-based reminder feels noticeably better than a generic one? | open |
| 12 | Should persona-building lean on explicit self-report or inferred behavior — where do they disagree? | open |
| 13 | Are there intent categories people don't want captured/analyzed at all (embarrassing, private, medical)? | open (tracked jointly with `PRIVACY.md`) |

## Adoption / retention ("why would this survive week 3")

| # | Question | Status |
|---|---|---|
| 14 | What actually causes ADHD-app abandonment — forgetting it exists, distrust after a bad reminder, something else? | open |
| 15 | Would users trust an AI-generated persona enough to act on it, or does it need a "why am I being reminded now" transparency layer? | partial — design answer given (a one-line "why" is a near-free byproduct of the urgency/receptivity/framing split), still needs real-use validation |

## Design decisions made since (2026-08-10 Notion doc)

Not open questions anymore, but flagged here since they resolve/reshape several items above and drive the current build sequence in `AGENTS.md`: a minimal intent `state` machine (see `schema/SCHEMA.md`), a six-moment detection table, the urgency/receptivity/framing decomposition for interventions (item 9, 15), a concrete Recovery Mode spec, and redefined success metrics (latency distribution, drop/stall rate — explicitly not streaks/DAU). See the Notion page's "Product Development Roadmap" section for the live source.

**2026-08-11 build (all frontend screens + persona wiring):** items 9/10/15's design answers are no longer just design — they're live. The "why am I being reminded now" transparency line (item 15) is now genuinely generated per check-in from a real ten-field onboarding persona, not a placeholder; the urgency/receptivity/framing split (items 9-10) is driven by that same persona for the first time. None of items 1-15 are answered by this — they still need real usage/user-research validation, not code — but the mechanism they'd be validating against now actually exists end-to-end rather than existing only as a design decision on paper.

## Standing caution

Item 1 and item 11+ pattern-inference claims are being validated only against Ismail's own mixed-subtype data. Do not treat "works for me" as "works generally" — push for at least one other tester with a different subtype before trusting any generalization claim from the Persona Agent.
