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
| 9 | Where's the helpful-nudge-to-nagging threshold, and does it shift by time of day, task type, or mood? | open |
| 10 | Does a missed reminder need repair (apology-free re-ask), or does repeated ignoring mean switch channel/timing? | open |

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
| 15 | Would users trust an AI-generated persona enough to act on it, or does it need a "why am I being reminded now" transparency layer? | open |

## Standing caution

Item 1 and item 11+ pattern-inference claims are being validated only against Ismail's own mixed-subtype data. Do not treat "works for me" as "works generally" — push for at least one other tester with a different subtype before trusting any generalization claim from the Persona Agent.
