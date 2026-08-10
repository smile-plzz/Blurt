# Roadmap

**This file is a mirror, not the source of truth.** The canonical, live copy is the Notion page
[`Blurt - "just blurt it out"`](https://app.notion.com/p/Blurt-just-blurt-it-out-3b446f62ebad807f9bdbf6a9d46e70ff)
(see `CLAUDE.md`) — Ismail edits and answers questions there, not here. This snapshot exists so the
roadmap's current shape is visible without leaving the repo; re-sync it by hand whenever the Notion
page changes materially, don't treat drift between the two as a merge conflict to resolve in favor
of this file.

Last synced: 2026-08-10.

---

### 🧭 Product Development Roadmap (live, synced with the repo)

This section is the working nerve center. The `Blurt` GitHub repo (`smile-plzz/blurt`) treats this whole page as the source of truth for product direction — Claude reads it before making structural changes, and adds questions here for you to answer as they come up.

**Build status by agent** (see `AGENTS.md` for full scope of each):

| Agent | Status |
|---|---|
| Data & Schema | ✅ `schema/intent.json` (0.2.0, includes the intent state machine below), `schema/persona.json` — versioned and documented |
| Capture | ✅ prototype live (`capture/web/`) — voice + typed fallback, writes state-machine-shaped events straight to localStorage |
| Frontend | 🟡 in progress — 10-screen mockup set done (`frontend/mockups/`); build-sequence steps 2-3 scaffolded (`frontend/web/`): home feed, manually hand-triggered `direct`/`inquiring` check-ins, and a rule-based "not sure" fallback for confusable moment pairs |
| Persona & Inference | 🟡 in progress — step 4 MVP scaffolded (`api/infer.js` + `frontend/web/app.js`'s `inferDecision()`): one Mistral call returns moment/urgency/receptivity/framing, falls back to steps 2-3 on failure. Needs `MISTRAL_API_KEY` set in Vercel manually. |
| Reminder & Tone | ⬜ not started |
| Orchestrator | ⬜ not started |
| Privacy | 🟡 draft decision only (local-first, one live exception: Web Speech API sends audio to Chrome/Edge's servers) |
| QA / Validation | 🟡 tracking the open questions below, no answers yet |

**Current build sequence** (supersedes the old two-phase "log yourself, then build" plan — see Section 3 for why):
1. ✅ Capture + intent state machine + minimal tracker
2. 🟡 Manual `direct`/`inquiring` check-in copy, hand-triggered (in progress — `frontend/web/`)
3. 🟡 "Not sure" fallback state + in-the-moment clarifying question for confusable moment pairs (A/C, B/E) — scaffolded (`frontend/web/app.js`: `isAmbiguous`/`renderNotSure`), heuristics not yet tuned against real data
4. 🟡 Persona/inference layer automates steps 2–3 (Option A: single LLM call for moment + urgency + receptivity + framing) — MVP scaffolded on Mistral via a Vercel serverless function (`api/infer.js`), needs `MISTRAL_API_KEY` set manually and real-use testing
5. ⬜ Recovery Mode, seeded by an onboarding gap-baseline question

**Next logical build step:** set `MISTRAL_API_KEY` in Vercel and real-use test step 4's automatic moment/urgency/framing decisions against the step 2/3 manual baseline — does the model's framing choice and "why" line actually feel better calibrated than picking it by hand?

---

#### ❓ Questions for Ismail (answer inline, Claude will pick these up)

1. Now that Capture + the check-in scaffold are live, have you self-tested with real captures yet? What did you learn about your own intent-decay pattern (gap length, time of day, task type)?
2. Do the `direct` and `inquiring` check-in tones actually feel different in practice, or does one need rewriting before step 3 builds on top of them?
3. Privacy: still comfortable with "local-first, Web Speech is the one exception" as a durable decision, or is on-device transcription (e.g. local Whisper) worth the extra build cost?
4. Onboarding's gap-baseline question ("how long do you usually go before checking in on things?") — want to draft the exact wording now, or wait until Recovery Mode (step 5) is actually being built?

*(Answer directly below each question or as a comment — Claude will treat this page as the roadmap driver going forward.)*

---

## 1. Concept Summary

**Product:** "Intent Capture" — a voice-first intention logger with persona-aware follow-up. A single-problem ADHD companion, not a task manager.

**The trap to avoid:** Most "ADHD apps" collapse into generic todo/reminder apps with rigid task structures — exactly what makes them fail for ADHD users, since task organizers assume someone can already break down, prioritize, and stick to a plan. A rigid list just becomes another source of shame when abandoned after day three.

**The core insight:** The failure point isn't planning or task management — it's that a fleeting intention ("I should cut my nails") forms and dies the moment attention shifts elsewhere, before it ever reaches the todo stage. The moment of intent itself needs to be captured before it evaporates.

**How it works:**
1. **Capture (near-zero friction)** — user speaks the moment an intention forms, no typing, no navigation, no forms. Voice-to-text converts it instantly.
2. **Persona-based analysis** — a standing model of the user (ADHD subtype, patterns, what they tend to forget, daily rhythm) decides *how* and *when* to resurface the intent, not a generic timer.
3. **Smart resurfacing** — instead of a rigid due date, the system reminds at a contextually smart moment, checks in ("did you do it?"), and follows up again later rather than treating one missed nudge as failure.
4. **Non-punishing loop** — follow-up is designed not to pressure or shame, closer to a gentle "still there?" than a red overdue badge.

**Why this is different from a todo app:**
- The user never has to *decide* to log a task or open an app with intent to organize — capture happens in the moment of thought, exactly when ADHD intentions are most fragile.
- The system does the categorizing and prioritizing (the unreliable executive-function step), not the user.
- Built around *one* mechanism — capture → persona-aware reminder → gentle follow-up — not a full life-management suite.

**Candidate core problems considered** (Intent Capture is the one chosen): task initiation paralysis, time blindness, object/context permanence, working memory drops mid-task, hyperfocus transition failure, emotional dysregulation from small failures.

**Key design principles:**
- One narrow problem solved deeply, not a general-purpose organizer.
- Each user's persona is private and self-contained — never pooled or generalized across users.
- The system does the categorizing/prioritizing, not the user.
- Self-test on yourself first before building the full product.

---

## 2. Persona System Design

**1. Onboarding (cold start)** — mix of multiple-choice questions (fast, structured signal: ADHD subtype, daily rhythm, known trigger patterns) and voice-recorded open answers (captures nuance and how the person actually talks about their own struggles). Both feed an initial persona draft — a working model of what this specific person forgets, when, and under what conditions, not just a subtype tag.

**2. Persona as living knowledge base (per-user, isolated)** — never shared or generalized across users, since ADHD manifests too differently person to person for a pooled model to be useful. Not static after onboarding; it's the thing the whole app is built around, so it keeps updating.

**3. Growth loop:**
- **Passive signal** — every captured intent, every check-in response, every ignored reminder feeds back into the persona.
- **Active signal** — periodic situational micro-questions fill gaps passive data can't explain (not a big survey).

**Rough data model:**
```plain text
User Persona {
  onboarding_profile: { adhd_subtype, mc_answers, voice_transcript_analysis }
  interaction_log: [ {intent, captured_at, reminder_sent_at, resolved: bool, resolved_at, follow_up_count} ]
  inferred_patterns: { forget_triggers, best_reminder_windows, task_categories_prone_to_drop }
  active_clarifications: [ {question, answer, timestamp} ]
}
```
`inferred_patterns` is the part most worth prototyping first — the layer that turns raw logs into something the reminder engine can act on, and the part that makes it a "persona" instead of a database.

**Decided:** pattern inference starts as LLM-based re-analysis of the log (simpler, more flexible, acceptable token cost at single-user self-test scale), hardened into rules later once real patterns are known to matter. See Section 3.7 for how this interacts with the six-moments detection work.

---

## 3. Intent State Machine, Six Moments & Intervention Design *(2026-08-10 decisions — current source of truth for build sequencing)*

### 3.1 Operationalizing the Six Moments (detection, not just definition)

The six moments (A–F) are defined below, but the real engineering problem is: **how does the system know which moment the user is in right now?** Without detection, "the app adapts to state" is just a slogan. Each moment has a different *signal signature*.

| Moment | Primary signal | Secondary signal (persona/history) | Confidence risk |
|---|---|---|---|
| A. "Don't know what to do" | Vague/open-ended capture, no named object ("ugh", "what now") | Time of day matches a known low-initiation window | Easy to confuse with C |
| B. "Know it, can't start" | Named, specific task + hesitation language repeated across captures without a resolve event | Task appeared 2+ times unresolved | Easy to confuse with E once the resolution window has passed |
| C. "Started, got distracted" | A previous intent marked in-progress, then a new unrelated capture arrives | Session/focus timer still running | Requires an "active task" state, which nothing else has yet |
| D. "Too much in my head" | Multiple captures in a short burst, or one long unstructured multi-clause capture | N/A | No fixed threshold — burst detection waits for a personal baseline from real capture data |
| E. "Didn't do what I planned" | Reminder fired, check-in returned "no" or was ignored past a window | Pattern of repeat no's on same task | Easiest to detect reliably |
| F. "Disappeared, now it's a mess" | Gap in capture activity exceeds the user's *own* typical gap (not a fixed number) | N/A | Needs a personalized baseline, or it fires too eagerly / never fires depending on usage level |

**Key design decision this forces:** the system needs an explicit, first-class **task state** (not just captured/resolved), because moments A/B/C/E are really different states of the *same* underlying task viewed at different times.

**Decision — confusable pairs (A/C, B/E):** when confidence is low, don't guess silently and don't stay dumb either. The system defaults to an explicit "not sure" state that triggers a neutral `inquiring`-framed intervention, *and* it can ask directly in the moment ("still working on that, or something new?") when the stakes of guessing wrong are high enough to bother asking.

### 3.2 The Minimal Intent State Machine

```plain text
CAPTURED
   │
   ▼
DORMANT ───────────────► (never resurfaced, ages out silently)
   │  (persona decides it's time)
   ▼
SURFACED ── user says "did it" ──► RESOLVED
   │
   ├── user says "not yet" ──► DEFERRED ──► SURFACED (later, different framing)
   │
   ├── ignored past window ──► STALLED
   │
   └── user says "doesn't matter" ──► DROPPED (not a failure — a real outcome)

STALLED ── repeats N times ──► FLAGGED_FOR_RECOVERY (moment E feeding into F)
```

- `DROPPED` as a distinct, legitimate end-state is what makes "resolved needs more than binary" actually implementable.
- `STALLED` accumulating triggers Recovery Mode (3.4) — not a calendar rule. Recovery is triggered by *stalled task density*, more robust to users who naturally check in rarely.
- Per-intent state machine; Recovery Mode operates on the *aggregate* of stalled intents.

**Decision:** skip a dedicated pre-build manual-logging phase — build against this state machine directly, but treat the states as editable for the first few weeks of real use, not locked. Implemented in `schema/intent.json` 0.2.0 as `state`/`state_updated_at`/`stall_count`.

### 3.3 The Intervention Decision Engine

Every intervention (reminder, check-in, follow-up, recovery prompt) is generated from three independent inputs, not one blob of copy:

1. **Urgency tier** — from the task itself (time-sensitive or not) and how many times it's stalled.
2. **User's current receptivity** — inferred from recent response patterns (answering, or going quiet).
3. **Framing mode** — a small fixed set the persona picks from:
   - `direct` — "Open the lecture." (best for B, low ambiguity)
   - `inquiring` — "Still on your mind, or can this go?" (best for stalled/aging intents, respects DROPPED as valid)
   - `activation-only` — no mention of the full task, just the smallest next physical action (best for B stalled 2+ times)
   - `silent-recovery` — no individual reminder, task folds into the next Recovery Mode session instead (best when receptivity is low — the concrete answer to "stop nagging, switch channel")

Separating these three lets urgency and tone be tuned independently, and gives a clean "why am I being reminded now" transparency layer almost for free (e.g. "You mentioned this twice this week") since the inputs are already explicit fields.

**Decision — copy drafting order:** `direct` and `inquiring` first (cover the highest-confidence, most common cases). `activation-only`/`silent-recovery` copy comes later, informed by how the first two land.

### 3.4 Recovery Mode — spec

**Trigger (decided):** whichever fires first — stalled/flagged-for-recovery count crosses a personal threshold, OR the user opens the app after a gap larger than their personal baseline.

**Seeding the personal gap baseline (decided):** ask directly during onboarding ("how long do you usually go before checking in on things?") rather than defaulting to a flat number or waiting on 2 weeks of history.

**Entry screen — three things, in order, one at a time:**
1. Acknowledge return with zero reference to gap length or missed-item count. No "23 overdue."
2. Ask one open question: "What's on your mind right now?" — free text/voice, not a list.
3. *Only after* the user responds, optionally surface 1–2 old stalled items, `inquiring`-framed, never a backlog dump.

**Which stalled items surface (decided):** rank by urgency tier first, recency as tiebreak. Skip topic/keyword matching for v1.

**Explicitly does NOT:** show a count of stalled/missed items anywhere in this flow; require triaging the full backlog before acting on what the user just said; reset or display a streak (streaks shouldn't exist at all, per the zero-guilt principle).

**Exit condition:** ends the moment the user has one actionable next step in hand, even if most stalled items are left untouched — they simply age back into `STALLED` and may resurface individually later.

### 3.5 Success Metrics (replaces DAU/streaks)

- **Time-to-first-action after Recovery Mode entry** (not whether the whole backlog got cleared)
- **Capture-to-resolution latency distribution** — the distribution, not the average (a bimodal pattern is expected and healthy)
- **Drop rate vs. stall rate** — rising DROPPED isn't bad (correctly letting go); rising STALLED is the real warning sign
- **Framing-mode effectiveness** — resolution rate broken out by which framing mode was used
- **Explicitly not tracked:** consecutive days opened, current streak, total tasks completed as a raw count — these produce the shame loop the product is designed to avoid.

**Decision:** build a minimal tracker now, before the AI/persona layer exists — capture-to-resolution latency and drop/stall counts, logged from day one. Implemented in `capture/web/app.js`'s `trackerStats()`.

### 3.6 Build Sequencing *(current — mirrored in the roadmap table above and `AGENTS.md`)*

1. Capture + state machine + minimal tracker wired in from the start. No AI, no persona, no reminders.
2. Draft `direct`/`inquiring` copy, manual (hand-triggered) resurfacing using them as fixed templates — tests whether the framing distinction actually feels different before automating selection.
3. Add the "not sure" fallback state + in-the-moment clarifying question for confusable moment pairs (A/C, B/E) — rule-based, no persona dependency.
4. Persona/inference layer automates steps 2–3, starting with Option A (3.7): one LLM call handling moment + urgency + receptivity + framing together.
5. Recovery Mode, seeded by the onboarding gap-baseline question, triggered by whichever fires first (stalled threshold or gap baseline).

This ordering exists specifically to avoid building the AI/persona layer before the state machine underneath it is proven right, which would force a rebuild.

### 3.7 Risk: Persona Complexity Across Six Moments

The persona was originally scoped as a single "when/how to remind" task. Six moments means **one persona object now supports six inference tasks** (which moment, what urgency, what receptivity, what framing) — a real scope increase.

- **Option A — one model, richer context:** single LLM call per event, returns a structured decision (moment, urgency, receptivity, framing) in one shot. Simpler, harder to debug which sub-decision failed.
- **Option B — decompose:** detect moment/urgency/receptivity as smaller, mostly rule-based signals (3.1's table), reserve the LLM for framing-mode copy generation. More moving parts, each independently testable.

**Decision:** start with Option A for build speed, refactor toward Option B only once real use shows specifically where it's getting things wrong — not pre-committing to decomposition before there's evidence. Given self-testing is on one mixed-subtype sample, watch for cases where *why* the system picked moment B vs. E isn't clear — that's the signal to peel that piece into its own rule-based check.

---

## 4. Open Validation Questions

Mirrors `OPEN_QUESTIONS.md` in the repo (owned by QA & Validation Agent) — keep both in sync when either changes.

**Core problem validation**
1. Is "intent decay" a distinct, common failure mode across ADHD subtypes, or mostly inattentive-type specific?
2. How long is the actual gap between intent formation and acting/forgetting — minutes, hours?
3. What non-app workarounds already work today (sticky notes, phone reminders, telling someone)? What does this need to beat?
4. Do non-ADHD people also experience intent decay — bigger market, or does it dilute the ADHD-specific angle?

**Capture mechanism**
5. Is voice really lowest-friction in the moment, or does self-consciousness (speaking aloud around others) block it?
6. Real dropout point: failing to capture at all, vs. capturing but then ignoring/distrusting the reminder?
7. How accurate does transcription need to be before errors themselves become a frustration source?

**Reminder / follow-up design**
8. What does "gentle" actually look like, per real ADHD users' own description (best/worst reminder they've received)?
9. *(Design answer given, Section 3.3 — needs real-use validation)* Where's the helpful-nudge-to-nagging threshold, and does it shift by time of day, task type, or mood?
10. *(Design answer given, Section 3.3 — needs real-use validation)* Does a missed reminder need repair, or does repeated ignoring mean switch channel/timing?

**Persona / personalization**
11. How many interactions before a persona-based reminder feels noticeably better than a generic one?
12. Should persona-building lean on explicit self-report or inferred behavior — where do they disagree?
13. Are there intent categories people don't want captured/analyzed at all (embarrassing, private, medical)? *(tracked jointly with `PRIVACY.md`)*

**Adoption / retention ("why would this survive week 3")**
14. What actually causes ADHD-app abandonment — forgetting it exists, distrust after a bad reminder, something else?
15. *(Design answer given, Section 3.3 — needs real-use validation)* Would users trust an AI-generated persona enough to act on it, or does it need a "why am I being reminded now" transparency layer?

**Standing caution:** items 1 and 11+ pattern-inference claims are validated only against Ismail's own mixed-subtype data. Don't mistake "works for me" for "works generally" — get at least one other tester with a different subtype before trusting any generalization claim from the Persona Agent.

---

## 5. Early Reviewer Notes (design critique, still relevant)

**What's genuinely strong:** the nail-cutting example targets the pre-planning moment where intent forms and dies — underserved and specific, not a generic ADHD trope. Refusing to generalize into a todo app despite the pull to do so (twice) is the right, and rare, call.

**Flags:**
1. **Voice capture still has an activation-energy problem.** Opening an app and speaking requires remembering the app exists, unlocking the phone, opening it — 3 steps of friction for the exact deficit being solved for. Widget/lock-screen/watch-complication access, or a wake-word, may matter more than any AI feature.
2. **"Gentle, no pressure" is easy to state, hard to build.** Too gentle → ignorable noise; too persistent → the nagging machine being avoided. Probably the hardest design problem in the product — now given a concrete structure in Section 3.3.
3. **Self-testing on one (mixed-subtype) person risks overfitting.** Fine for prototype/validation, but don't mistake "works for me" for "works generally."
4. **Privacy/sensitivity:** voice recordings + a detailed behavioral/failure log is sensitive health-adjacent data. Local-first vs. cloud-processed should stay a deliberate, revisited decision (see `PRIVACY.md`, question 3 in the roadmap section above).
5. **"Resolved" needed more than binary yes/no** — addressed via `resolution_status`'s enum and, since 2026-08-10, the `state` machine in Section 3.2.

The two things worth the most prototype time before any AI/persona work were **capture friction** and **follow-up tone** — both now have live prototypes (`capture/web/`, `frontend/web/`).
