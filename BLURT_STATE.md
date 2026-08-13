# Blurt Build State — 2026-08-12

## Orchestra
- **Conductor:** Alfred (this session, Telegram group `-5318745691`)
- **Active agents:** None yet — spinning up now
- **Target repo:** `/tmp/blurt-inspect` (github.com/smile-plzz/Blurt)
- **Group chat:** Telegram `-5318745691` ("Blurt Build" — t.me/+52xwGXpKXQ9jYjA1)

## Build Order (from AGENTS.md)
1. **Schema Agent** — intent.json + persona.json + SCHEMA.md + versioning + storage boundary. (GOING NOW)
2. **Capture Agent** + **Reminder/Tone Agent** — in parallel, against stubs
3. **Persona Agent** — once schema is stable + fake interaction data exists
4. **Frontend/Render Agent** — against stub JSON
5. **Orchestrator/LLM Agent** — wires capture → persona → reminder → render (last)
6. **Privacy Agent** + **QA Agent** — continuous throughout

## Current Repo State
- `schema/intent.json` — 0.3.0, JSON Schema draft 2020-12. Full lifecycle: id, text, captured_at, capture_method, reminder_sent_at, follow_up_count, resolution_status (enum: unresolved/done/done_late/done_adjacent/no_longer_relevant/abandoned), resolved_at, category, state (captured/dormant/surfaced/resolved/deferred/stalled/dropped/flagged_for_recovery), parent_intent_id, subtasks, deadline, deadline_confirmed_absent, state_updated_at, stall_count.
- `schema/persona.json` — 0.2.0. Per-user isolated. onboarding_profile (10 MC fields + voice transcript analysis), interaction_log (append-only), inferred_patterns (with confidence), active_clarifications.
- `schema/SCHEMA.md` — human-readable docs, migration notes (0.1.0→0.2.0→0.3.0), storage boundary = local-first draft assumption.
- `api/decompose.js` — Vercel serverless stub (task decomposition)
- `api/infer.js` — Vercel serverless stub (LLM inference, Mistral API)
- `capture/web/` — PWA shell: index.html, app.js, sw.js, style.css
- `frontend/web/` — App shell: app.js, intents.js, onboarding.js, persona.js, recovery.js, settings.js, task.js, style.css, HTML pages
- `frontend/mockups/` — Design system mockups (classical, modernist, organic) + onboarding flow + v1 mockups
- `orchestrator/README.md` — Orchestrator agent spec (empty, to be built)
- `persona/README.md` — Persona agent spec (empty)
- `reminder/README.md` — Reminder agent spec (empty)
- `PRIVACY.md` — Draft privacy doc (local-first assumption stated)
- `OPEN_QUESTIONS.md` — Validation questions tracker
- `ROADMAP.md` — Notion roadmap reference
- `CLAUDE.md` / `AGENTS.md` — Build instructions for multi-agent workflow

## Open Questions (from blurt-concept.md)
- How does persona get built — onboarding questionnaire or inferred over time?
- What's the check-in cadence that feels supportive vs nagging?
- Does "no" to a check-in trigger re-scheduling or softer follow-up?
- LLM-based inference vs rule/stat-based for pattern detection (self-test phase → LLM fine)
- Recovery Mode: what triggers it, what does it look like?
- Task decomposition: which intents get decomposed, when, how proposed vs committed
- Storage boundary: what stays local vs what (if anything) leaves the device
- Does speaking out loud in public defeat capture for some users? Need silent/typed fallback.

## What Each Agent Needs to Produce
- **Schema Agent:** Formalize intent lifecycle schema (resolution_status enum, state machine), persona schema with 10 MC fields, SCHEMA.md with migration notes, versioned from day one. Storage boundary draft.
- **Capture Agent:** Access point prototype (widget/lock-screen/wake-word speculation), voice-to-text pipeline spec, silent/typed fallback path, raw captured-intent event spec matching intent.json.
- **Persona Agent:** Onboarding flow (3-pass, 10 questions), passive signal collection spec, active signal collection (micro-questions), LLM-based inference pipeline spec with confidence metrics, overfitting instrumentation.
- **Reminder/Tone Agent:** Check-in flow spec, framing-mode copy variants (direct/inquiring/activation-only/silent-recovery), nagging threshold research, repair-vs-channel-switch decision for repeated ignoring.
- **Frontend Agent:** Capture confirmation UI (near-invisible), check-in UI (4-way resolution: did it / didn't / adjacent / doesn't matter), reminder surface render off JSON, thin rendering layer (no timing/tone logic).
- **Orchestrator Agent:** System prompt(s) for capture→persona→reminder→render pipeline, separate persona-read and reminder-plan-write steps, integration layer (built last).
- **Privacy Agent:** PRIVACY.md with explicit local-vs-cloud decision, opt-out categories for intent types, review of each agent's data collection scope.
- **QA Agent:** OPEN_QUESTIONS.md as living checklist, intent-decay validation questions, overfitting warning (Ismail's mixed subtype → need 2nd tester), "why survive week 3" retention concern.

---

## Session log — 2026-08-13 (Claude Code, ismai's machine, no Telegram/Alfred conductor)

Picked up from this file's 2026-08-12 snapshot. At session start: Schema/Capture/Frontend/Persona
had real code; Orchestrator and Reminder were still spec-only (`README.md` said "Not started");
`PRIVACY.md` and two `REVIEW.md` files (`capture/`, `orchestrator/`) were uncommitted work already
sitting in the working tree from an unfinished prior pass.

**What this session did (scoped by user request — "ship the tractable engineering," explicitly
not the pieces that need real user testing or native-mobile work):**
- Verified `PRIVACY.md`'s rewrite was actually already complete (an earlier `head -100` truncation
  made it look cut off) — no work needed, just committed.
- Built `api/orchestrator.js`: the two-step persona-read → reminder-plan pipeline from
  `orchestrator/REVIEW.md`, composed inside one Vercel endpoint. Skips the persona-read LLM call
  entirely while `inferred_patterns` is empty (always true today — no Persona inference pass writes
  it yet) in favor of a deterministic summary from `onboarding_profile`. Wired
  `frontend/web/app.js`'s `inferDecision()` to call it instead of `/api/infer` (left in place as
  fallback). Updated `orchestrator/README.md` status.
- Fixed the two flagged Capture gaps: `blurt:intent-captured` custom event now dispatches from
  `saveIntent()`; `SCHEMA_VERSION` bumped `0.2.0` → `0.3.0`.
- Scaffolded `reminder/scheduler.js`: fixed-interval check-in timing + the already-decided
  repair-vs-silent-recovery follow-up logic, as pure functions (tested against fake intents, not
  wired to any live trigger — no push/notification channel exists in this PWA). Explicitly documented
  as infrastructure for tone/timing testing, not a substitute for it.
- Synced `ROADMAP.md`'s build-status table and sequence list to match (Orchestrator/Reminder both
  ⬜→🟡). **Not pushed to the canonical Notion page** — `CLAUDE.md` says Notion is source of truth
  and `ROADMAP.md` should mirror it, not the reverse; this session followed prior commits' actual
  practice of updating `ROADMAP.md` directly, but the Notion page still needs a manual sync from
  whoever has access.

**What's still genuinely unbuilt / can't be finished by code alone:**
- Reminder/Tone's actual hard problem — tone and timing validated against real ADHD user reactions
  (`OPEN_QUESTIONS.md` items 8-9 stay "open"/"partial"). `scheduler.js`'s intervals and thresholds
  are documented as untuned guesses.
- Capture's access-point layer (widget/lock-screen/wake-word) — needs native mobile work, not a PWA
  change.
- On-device Whisper transcription (`PRIVACY.md` §3's target state) — still browser-native
  `SpeechRecognition`, which sends audio off-device in Chrome/Edge.
- Privacy's opt-out tiers (`PRIVACY.md` §2) are designed but need a Schema Agent decision on where
  the `sensitivity`/`excluded_inference_categories` field lives before they're implementable.

---

## Session log — 2026-08-13 (Claude Code, ismai's machine) — UI/UX refinement round-trip

Local clone was 74 commits stale at session start (last synced 2026-08-13's earlier session);
`git pull` brought it current before any work started. The user sent a Notion brief
("UI/UX Refinement" page, written earlier this session) to Claude Design, then handed back its
output as a zip (`UI mockups project kickoff.zip`) containing a refreshed 17-screen mockup set plus
an auto-generated `github.md` sync summary.

**Correction made mid-session:** the zip's `Blurt Mockups v2.dc.html` looked like the newest file by
name but was actually the *previous* (14-screen) mockup pass, archived under that name; the true
latest was `Blurt Mockups.dc.html` (17 screens, matches `github.md`'s sync note). Initial work
(the "why now" disclosure) was built against content that happened to match either version, but the
rollup-scope conclusion drawn from the wrong file was backwards and had to be reverted once the
mistake was caught — see below.

**What shipped, reconciling `web/` against the true-latest mockup's four "drifted behaviours":**
- Rollup check-in reverted from global (all parents + resurfacing merged into one screen, built
  2026-08-11) back to per-parent scope, matching the refined mockup's explicit reversal of that
  earlier decision. `renderGlobalRollup` → `renderRollup`.
- "Why am I being reminded now" transparency note converted from text concatenated into the
  check-in body to its own closed-by-default disclosure toggle (`checkin-why-toggle`/`checkin-why`).
- New resumable Settings persona-edit flow (`review.html`/`review.js`) replacing the old "Edit"
  link, which restarted the ten-question onboarding from scratch — a documented open item since
  2026-08-11. `QUESTIONS` extracted from `onboarding.js` into shared `questions.js`.
- Decomposition's subtask-removal interaction checked against the mockup's annotation (which
  claimed the build still used delete-row buttons) and found already correct — the annotation was
  stale, left unchanged after verifying `renderDecomposeProposal` directly.
- Full 17-screen mockup export synced into `frontend/mockups/` (previously stale, from before the
  2026-08-11 pass).

### Follow-on: product copy + UX audit (same day)

A launch-readiness audit and then a full product-language audit ran against the whole surface.
Two classes of problem, both fixed:

**Build instruments were shipping as product.** The check-in rendered a debug line reading
`mistral · <moment> · <urgency> urgency` — naming the model vendor and the internal taxonomy — and
on fallback, `rule-based fallback — AI call failed or MISTRAL_API_KEY not set`, naming an env var
to a user who has no idea what that is. The manual `direct`/`inquiring` framing picker, a step-2
tone-testing control, was a visible radio group on every check-in. Both now render only with
`?dev=1` (`DEV` in `app.js`).

**One concept, many words.** "Let it go" / "Drop it" / "Archive" / "no longer relevant" were all
the same action; "Not yet" / "Still there" / "Still is" / "Still on that" were all the other one.
Unified into a documented vocabulary — see `frontend/README.md`'s new "Product language system"
table. State-machine identifiers (`dormant`, `stalled`, `surfaced`…) were also printing straight
into feed tags; `stateLabel()` in `intents.js` is now the single translation point.

Also fixed in the same pass: the empty state was a dead end ("nothing captured yet.", no CTA) on
the first screen after onboarding; `"Mentioned twice this week"` and the model's `why` prompt both
asserted time windows nothing verifies, which for a product selling trustworthy resurfacing is a
worse failure than being vaguer; Safari/Firefox users got "voice not supported here" with no
explanation of what still works; `"A moment later"` was a mockup *stage direction* that shipped as
a card label; `"I've used Blurt before"` implied restoring an account that does not exist; and
`Keep these one` was reachable in the decomposition proposal. `README.md` was rewritten for an
outside visitor and now documents `MISTRAL_API_KEY` as a setup step, which only internal docs had.

**Deliberately not changed:** the onboarding question wording (genuinely well-written), "tap.
speak. done.", "Still on your mind, or can this go?", "That's enough for now", "Updated. Nothing
else changed.", and every zero-guilt structural decision.

**Still open from the launch audit** (engineering, not copy): no landing page — `/` drops a
first-time visitor into an empty feed; `frontend/web/` has no manifest or service worker, so only
`capture/web/` is installable; `capture/web/icon.svg` is a placeholder with no PNG fallbacks.

**Not reconciled this pass:** Task detail's visual grouping (mockup wants a flat list with day-chip
tags and one pinned deadline prompt; built version uses three section headers and a focused-card
pattern that surfaces one prompt at a time). Functionally equivalent, cosmetic-only gap — lower
priority, flagged in `frontend/README.md`.
