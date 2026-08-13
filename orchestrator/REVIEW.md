# Blurt Orchestrator / System-Prompt Agent — Review

**Prepared by:** Orchestrator Agent (AGENTS.md §6)
**Date:** 2026-08-12
**Source docs:** `blurt-concept.md`, `AGENTS.md`, `ROADMAP.md`, `BLURT_STATE.md`, `schema/SCHEMA.md`, `schema/intent.json`, `schema/persona.json`, `capture/REVIEW.md`, `api/infer.js`, `api/decompose.js`, `frontend/web/app.js`

---

## 1. Summary of Agent Outputs Reviewed

### Schema Agent (`schema/intent.json` 0.3.0, `schema/persona.json` 0.2.0, `schema/SCHEMA.md`)

**intent.json** — Full lifecycle schema with two orthogonal axes:
- `resolution_status` (enum: `unresolved / done / done_late / done_adjacent / no_longer_relevant / abandoned`) — final classification, not boolean. The `done_adjacent` and `no_longer_relevant` values are directly responsive to the source doc's flag that "resolved needs more than binary yes/no."
- `state` (enum: `captured / dormant / surfaced / deferred / stalled / resolved / dropped / flagged_for_recovery`) — lifecycle position, distinct from resolution. The state machine (`captured → dormant → surfaced → {resolved|deferred|stalled|dropped}`, stalled repeats → `flagged_for_recovery`) is the backbone the Orchestrator's reminder-plan step must respect.
- 0.3.0 additions: `parent_intent_id`, `subtasks` (array of ids), `deadline`, `deadline_confirmed_absent` — decomposition + deadline fields. Subtasks are full intents, not a parallel schema.
- Required fields: `id`, `text`, `captured_at`, `resolution_status`, `state`.

**persona.json** — Per-user, isolated. 0.2.0 has:
- `onboarding_profile`: 10 first-class MC fields (`entry_state`, `typical_intent_class`, `intent_surface_moments`, `primary_stall_point`, `avoidance_driver`, `energy_windows`, `gap_baseline_days`, `preferred_framing`, `drop_prone_domains`, `stated_goal`) + `mc_answers` overflow + `voice_transcript_analysis`. `adhd_subtype` kept for schema stability only — not self-reported anymore.
- `interaction_log`: append-only, one entry per lifecycle event.
- `inferred_patterns`: `forget_triggers`, `best_reminder_windows`, `task_categories_prone_to_drop`, plus per-field `confidence` metrics (the overfitting-visibility instrument the source doc asks for).
- `active_clarifications`: periodic micro-questions + answers.

**Storage boundary:** Local-first by default draft assumption. The Orchestrator's LLM calls are the only planned egress point — and even that should be revisited against the Privacy Agent's opt-out/local-only requirements before wiring.

**Conformance note for Orchestrator:** The schema is stable and versioned. The Orchestrator's prompts must not assume fields that don't exist yet (e.g., `interaction_log` entries have a defined shape but the log itself is empty until the Persona Agent starts writing it). All persona fields are nullable — the prompts must degrade gracefully when they're absent.

### Capture Agent (`capture/REVIEW.md`, 17KB)

**What's there:** PWA shell (`capture/web/`) with voice (Web Speech API / `SpeechRecognition`) + typed fallback, writes `intent.json`-shaped objects to `localStorage` under `blurt_intents_v0.1.0`, exposes `trackerStats()` as `window.blurtTracker`, non-blocking 1.4s toast confirmation. Schema migration backfills 0.1.0→0.2.0 on read.

**What's missing (relevant to Orchestrator):**
1. No downstream wiring — intents sit in `localStorage`; Persona/Reminder/Orchestrator don't consume this store yet. `trackerStats()` is exposed but nothing calls it. The Orchestrator needs a clean input path from captured intents.
2. `SCHEMA_VERSION = "0.2.0"` in `capture/web/app.js` but schema is at 0.3.0 — non-blocking (capture doesn't write the new fields) but confusing for downstream readers.
3. No `blurt:intent-captured` custom event — downstream agents would need to poll `localStorage`. The Orchestrator's pipeline should subscribe to this event rather than poll.
4. `SpeechRecognition` is not Whisper-flow — Chrome sends audio to Google's servers. Privacy flag for the Privacy Agent. The Orchestrator should not care about transcription quality, but the privacy posture affects whether the Orchestrator's LLM call is the *only* egress or one of several.

**Access point conclusion (captured here for Orchestrator awareness):** The Capture Agent recommends prototyping a lock-screen/home-screen widget first. This matters for the Orchestrator because the widget changes *how* the capture UI is reached, not *what* happens once open — the transcription and emission logic is the same regardless of entry point. The Orchestrator's pipeline input is the same raw `intent.json` event either way.

### Reminder & Tone Agent

No REVIEW file yet — agent not started (ROADMAP.md status: ⬜ not started). The Orchestrator's reminder-plan prompt is effectively designing the interface this agent will consume. The prompts must leave room for this agent's copy library and scheduling logic to plug in later.

### Frontend/Render Agent (`frontend/web/app.js`, 712 lines)

**What's there:** Full rendering layer — `renderFeed()`, `buildFeedRow()`, `framingCopy()` (direct + inquiring copy variants), `renderCheckin()`, `renderNotSure()`, `renderDecomposeProposal()`, `renderGlobalRollup()`, `maybeEnterRecovery()` entry gate, radio-picker change handlers, `closeCheckin()`, `setCheckinSource()` (visible debug label showing whether Mistral call ran or fallback used).

**Key Orchestrator interfaces in app.js:**
- `inferDecision(intent)` — calls `/api/infer` with `{text, state, stall_count, captured_at, resolution_status, persona: persona?.onboarding_profile}`. Returns `{moment, urgency, receptivity, framing, why}` or `null` on failure.
- `openCheckin(id)` — dispatches decomposition first (`fetchDecomposition`), then `runCheckin()`.
- `runCheckin(intent, id)` — calls `inferDecision()`, renders based on result, falls back to rule-based/manual flow if AI call fails.
- `framingCopy(intent, framing)` — returns `{kicker, title, body, actions[]}` for direct and inquiring framings. The Orchestrator's reminder-plan output must produce values that map cleanly into this function's expected shape.

**Frontend contract the Orchestrator must satisfy:** The reminder-plan JSON output needs at minimum `{moment, urgency, framing, why}`. The frontend already handles `not_sure` + no-framing as a special case (`renderNotSure`). The Orchestrator's Step B prompt should never return a non-null `framing` when `moment` is `not_sure`.

### Existing Orchestrator scaffold (`orchestrator/README.md`)

Empty stub: "Not started — blocked by design. Do not start until Capture, Persona, and Reminder each work independently against stub data." Status: ready to build now. The Capture and Frontend agents have live prototypes; the Persona and Reminder agents have schemas but no REVIEW files yet. This satisfies the "stubbed interface" dependency.

---

## 2. System Prompt Design

The existing `api/infer.js` collapses persona-read and reminder-plan-write into one prompt. The Orchestrator's job is to split them so the Persona Agent's inference logic stays swappable. Two separate prompts, two separate calls (or one batched call with two turns — see MVP section).

### Step A: Persona Read

**Purpose:** Takes the user's current persona state (`onboarding_profile` + `inferred_patterns`) and returns a concise context summary for the reminder-plan step. Not the full persona — just what the reminder plan needs to know.

**Why separate:** The Persona Agent's inference logic (LLM-based re-analysis of `interaction_log` → `inferred_patterns`) is swappable. If it later switches to rule/stat-based inference, or if `inferred_patterns` gets richer/poorer, this prompt doesn't change — it just reads whatever `inferred_patterns` exists.

**Input shape (what the Orchestrator passes):**
```json
{
  "onboarding_profile": {
    "primary_stall_point": "starting",
    "avoidance_driver": "dread",
    "energy_windows": "bursts",
    "preferred_framing": "inquiring",
    "drop_prone_domains": ["work_study", "self_care"],
    "typical_intent_class": "small_annoying",
    "intent_surface_moments": ["mid_task", "reminded_by_someone"],
    "gap_baseline_days": 4,
    "stated_goal": "catching_things",
    "entry_state": "fine_ahead_of_it",
    "mc_answers": {},
    "voice_transcript_analysis": "User describes forgetting things in the middle of switching tasks, especially self-care items"
  },
  "inferred_patterns": {
    "forget_triggers": ["task switching", "end of day"],
    "best_reminder_windows": ["late morning", "early evening"],
    "task_categories_prone_to_drop": ["self_care", "home_admin"],
    "confidence": {
      "forget_triggers": 0.3,
      "best_reminder_windows": 0.2,
      "task_categories_prone_to_drop": 0.5
    }
  }
}
```

**Output shape (what Step A returns — a compact summary, not the full object):**
```json
{
  "moment_priors": { "primary_stall_point": "starting", "avoidance_driver": "dread" },
  "framing_prior": "inquiring",
  "energy_signal": "bursts",
  "drop_prone_domains": ["self_care", "work_study"],
  "persona_confidence": 0.35,
  "summary": "User stalls at starting, driven by dread — never escalate urgency on repeat stalls of this kind. Energy comes in bursts, so clock-time alone shouldn't raise urgency. Prefers inquiring framing. Self-care and work/study items are drop-prone — missed self-care must never be framed like a deadline."
}
```

**Step A system prompt:**

```
You are the Persona Read step for Blurt, an ADHD intent-capture companion.
Your input is one user's current persona state: their onboarding_profile
(what they told us at onboarding) and their inferred_patterns (what the
Persona Agent has learned from their behavior so far, with confidence scores).

Your job is to produce a concise context summary that the Reminder Plan step
will use as priors — NOT the full persona, NOT the reminder plan itself.

Be concise. The Reminder Plan step needs to know:
1. What moment priors to apply (primary_stall_point → which of A/B/C/F gets a prior boost; avoidance_driver → how to treat repeat stalls)
2. What framing prior the user stated (preferred_framing), and whether it's one of the two implemented modes (direct/inquiring) or one of the two not-yet-built modes (activation-only/silent-recovery)
3. What energy/receptivity signal to use (energy_windows)
4. What domains are drop-prone (drop_prone_domains), with special handling for self_care (never frame like a deadline)
5. How confident the persona is overall (low confidence → treat priors as weak suggestions, not rules; the intent's own signal can override)

Rules:
- Persona fields absent or null carry NO signal. Do not invent values.
- inferred_patterns.confidence scores are per-field. If confidence is below 0.4 on a field, treat that field as a weak hint, not a strong prior.
- The summary field should be 1-2 plain-English sentences capturing the gist — this is what a future "why am I being reminded now" transparency layer may eventually surface, so keep it concrete and non-judgmental.
- NEVER output a reminder plan, scheduling decision, or copy. That's Step B's job.
- Return ONLY a JSON object with the fields above. No other text.
```

### Step B: Reminder Plan Write

**Purpose:** Takes the raw captured intent text + the persona summary from Step A + reminder history (reminder_sent_at, follow_up_count, resolution_status, state) and outputs the JSON-structured reminder plan the Frontend Agent renders.

**Why separate from Step A:** The reminder plan is where the actual intervention decision lives — moment detection, urgency, framing, scheduling hints. The persona is just priors. Splitting them means the Persona Agent can improve its inference without touching the reminder-plan prompt, and the reminder-plan prompt can be tested with synthetic persona summaries without needing a real persona store.

**Input shape (what the Orchestrator passes):**
```json
{
  "intent": {
    "id": "uuid",
    "text": "I should cut my nails",
    "captured_at": "2026-08-12T14:30:00Z",
    "state": "dormant",
    "stall_count": 0,
    "resolution_status": "unresolved",
    "reminder_sent_at": null,
    "follow_up_count": 0,
    "parent_intent_id": null,
    "subtasks": [],
    "category": null
  },
  "persona_summary": {
    "moment_priors": { "primary_stall_point": "starting", "avoidance_driver": "dread" },
    "framing_prior": "inquiring",
    "energy_signal": "bursts",
    "drop_prone_domains": ["self_care", "work_study"],
    "persona_confidence": 0.35,
    "summary": "User stalls at starting, driven by dread..."
  },
  "reminder_history": {
    "reminder_sent_at": null,
    "follow_up_count": 0,
    "resolution_status": "unresolved",
    "state": "dormant"
  }
}
```

**Output shape (what Step B returns — the reminder plan the frontend renders):**
```json
{
  "moment": "B",
  "urgency": "low",
  "receptivity": "unknown",
  "framing": "inquiring",
  "why": "You mentioned this twice this week",
  "schedule_hint": {
    "window": "late morning",
    "follow_up_count_max": 2,
    "reminder_style": "inquiring_check_in"
  },
  "decomposition_candidate": false
}
```

**Step B system prompt:**

```
You are the Reminder Plan step for Blurt, an ADHD intent-capture companion.
Your input is one captured intent (raw text + lifecycle state), a persona
summary from the Persona Read step (your priors — not the full persona), and
reminder history for this intent (whether it's been reminded before, how many
follow-ups, what its current state is).

Your job is to produce a structured reminder plan: which of the six moments
(A/B/C/D/E/F) the user is most likely in right now, how urgent this feels,
what framing mode to use, a one-line "why am I being reminded now"
transparency note, and a schedule_hint the Reminder Agent can act on.

The six moments (from the app's detection table):
- A "don't know what to do" — vague capture, no named object ("ugh", "what now")
- B "know it, can't start" — named task, hesitation language, repeated unresolved
- C "started, got distracted" — previous intent in progress, new unrelated capture arrives (requires an active-task concept not built yet)
- D "too much in my head" — capture bursts, multiple intents in short time
- E "didn't do what I planned" — reminder fired, check-in returned "no" or ignored
- F "disappeared, now it's a mess" — gap in capture activity exceeds user's typical gap

Use the persona summary as PRIORS that the intent's own signal can override,
not hard rules:
- If primary_stall_point is "starting", boost prior toward moment B.
- If primary_stall_point is "deciding", boost prior toward moment A.
- If primary_stall_point is "finishing", boost prior toward moment C.
- If primary_stall_point is "remembering", boost prior toward moment F.
- If avoidance_driver is "dread", never raise urgency on repeat stalls of this kind; prefer "inquiring" over "direct"; treat the user dropping the item as a genuinely good outcome, not a failure.
- If avoidance_driver is "size", this is a decomposition candidate, not a repeat-reminder candidate; keep urgency low and note it in why if relevant.
- If avoidance_driver is "boredom", prefer framing that names the smallest next action rather than the whole task.
- If avoidance_driver is "timing", don't escalate framing on repeat stalls — the issue is when, not whether.
- If energy_windows is "bursts", do not treat elapsed clock time alone as rising urgency.
- If energy_windows is "rarely", keep urgency capped at "low" or "medium" and prefer "inquiring" framing; this user has said they can't absorb much intervention volume.
- If preferred_framing (from persona summary) is "direct" or "inquiring", use it as the starting framing prior — but the intent's own signal can override.
- If preferred_framing is "activation-only" or "silent-recovery" (not yet implemented), lean toward the closest available mode: "activation-only" → lean "direct" but keep why concrete and action-first; "silent-recovery" → lean "inquiring" and keep urgency low. Note in why that this is an approximation.
- If drop_prone_domains includes the intent's domain, that alone is NOT a reason to increase urgency. A missed self_care intent must NEVER be framed like a missed deadline.

Decision rules:
- Use "not_sure" for moment whenever the signal is genuinely too thin to pick confidently, especially for the confusable pairs A/C and B/E. Do NOT guess silently when unsure.
- When moment is "not_sure", set framing to null (not "direct" or "inquiring").
- urgency: "low", "medium", or "high" — base on stall_count, whether the task reads as time-sensitive, and the persona guidance above. A first-ever capture with no stall history is almost always "low".
- receptivity: "high", "low", or "unknown". Base on energy_windows and avoidance_driver if the persona summary has them. If persona_confidence is low and there's no interaction history, return "unknown" rather than inventing a signal.
- why: one short concrete sentence a user could read as "why am I being reminded now" — e.g. "You mentioned this twice this week", "This has been sitting unresolved for a while", "You said you tend to forget this kind of thing". Never generic ("It seems relevant").
- schedule_hint: an object with window (a time-of-day hint from the persona summary's best_reminder_windows if available, else null), follow_up_count_max (a small number — 2 or 3 max for MVP; the Reminder Agent decides exact cadence), and reminder_style (one of "direct_check_in", "inquiring_check_in", "silent_recovery_fold_in", or null when moment is not_sure).
- decomposition_candidate: true if the intent text plausibly bundles multiple distinct sub-actions a person would do separately ("plan the birthday party", "clean out the garage"), false for atomic actions ("cut my nails", "call mom"). This is a signal for the decomposition flow, not a commitment to decompose. The decomposition agent decides the actual breakdown.

Return ONLY a JSON object with the fields above. No other text.
```

---

## 3. Orchestration Pipeline Design

### Pipeline: capture → persona read → reminder plan → frontend render

```
┌──────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Capture  │────▶│  Persona     │────▶│  Reminder Plan   │────▶│  Frontend    │
│  Agent    │     │  Read (Step A)│     │  (Step B)        │     │  Render      │
└──────────┘     └──────────────┘     └──────────────────┘     └──────────────┘
     │                   │                      │                      │
     │                   │                      │                      │
     ▼                   ▼                      ▼                      ▼
saveIntent()      read persona.json       Step B prompt           framingCopy()
+ dispatch           (onboarding_profile   + intent +               renders check-in
  blurt:intent-     + inferred_patterns)   history                 UI from JSON
  captured event                        → reminder plan JSON
                                       (moment/urgency/
                                        framing/why/
                                        schedule_hint/
                                        decomposition_candidate)
```

### Step-by-step flow

**1. Capture** (Capture Agent — already built)
- User speaks or types an intent. `saveIntent()` writes to `localStorage` and (when the Capture Agent's pending change lands) dispatches `blurt:intent-captured` with the intent JSON.
- The Orchestrator subscribes to this event. No polling.

**2. Persona Read (Step A)** (Orchestrator — New)
- On `blurt:intent-captured` (or on a timer for persona refresh, since `inferred_patterns` changes independently of captures), the Orchestrator reads the user's `persona.json` (onboarding_profile + inferred_patterns), passes it to Step A's prompt, gets back a compact persona summary.
- This step can be cached — the persona summary only needs recomputing when `inferred_patterns` changes (via the Persona Agent's periodic inference pass) or when the user re-ond 주택boards. For MVP, compute on demand and cache until the next persona change.
- **MVP simplification:** Step A can be skipped entirely if `inferred_patterns` is empty (cold start, no interaction log yet). In that case the persona summary is built from `onboarding_profile` alone, which the existing `api/infer.js` already does.

**3. Reminder Plan (Step B)** (Orchestrator — New)
- When the user opens an intent for check-in (Frontend's `openCheckin()` → `runCheckin()`), the Orchestrator fires Step B: intent text + lifecycle state + persona summary (from Step A, cached or freshly computed) + reminder history → reminder plan JSON.
- This is the call that replaces the current single `api/infer.js` call. The existing `inferDecision()` in `app.js` becomes a thin wrapper that calls Step B (and Step A if needed) instead of calling `/api/infer` directly.
- The reminder plan JSON maps directly into `framingCopy()` and `renderCheckin()` — same shape the frontend already expects.

**4. Frontend Render** (Frontend Agent — already built)
- `renderCheckin(framing, why)` renders the check-in UI from the reminder plan's framing + why fields.
- `renderNotSure(why)` renders the "not sure" fallback when moment is `not_sure`.
- `setCheckinSource("auto", ...)` labels the check-in with the AI decision source — the existing debug affordance.

### What the Orchestrator does NOT do

- **Does not transcribe.** That's the Capture Agent's job.
- **Does not infer patterns.** That's the Persona Agent's job. The Orchestrator reads `inferred_patterns`, it doesn't create them.
- **Does not schedule reminders.** That's the Reminder Agent's job. The Orchestrator produces a `schedule_hint`; the Reminder Agent decides when to fire.
- **Does not decompose.** That's the existing `api/decompose.js` + `fetchDecomposition()` flow, which the Orchestrator's Step B flags as a candidate but doesn't execute.
- **Does not render.** That's the Frontend Agent's job.

### Error handling

- If Step A fails (persona store missing, LLM call fails), fall back to a bare persona summary: `{moment_priors: {}, framing_prior: null, energy_signal: null, drop_prone_domains: [], persona_confidence: 0, summary: "No persona data available."}`. Step B degrades gracefully — it just has no priors.
- If Step B fails, fall back to the existing rule-based/manual flow in `app.js` (`isAmbiguous()` + radio picker). The `setCheckinSource("fallback", ...)` label already handles this.
- If the LLM call times out (8s AbortController, same as existing `api/infer.js`), treat as failure, not success.

### Subscribing to capture events

The Capture Agent's pending change adds `blurt:intent-captured`. The Orchestrator subscribes once at startup:

```js
window.addEventListener("blurt:intent-captured", (e) => {
  const intent = e.detail; // the intent.json object
  // Optionally pre-warm Step A persona summary cache
  // Step B is called on demand when user opens the check-in
});
```

If the custom event isn't available yet (Capture Agent hasn't shipped the change), the Orchestrator falls back to reading `localStorage` on check-in open — same data, just polled instead of event-driven.

---

## 4. Review of Existing Code

### `api/infer.js` — existing LLM inference stub

**What's there:**
- Vercel serverless function, POST-only, requires `MISTRAL_API_KEY`.
- One `SYSTEM_PROMPT` that combines persona-read and reminder-plan-write into a single call — takes `text, state, stall_count, captured_at, resolution_status, persona` (5 persona fields subset) and returns `{moment, urgency, receptivity, framing, why}`.
- 8s timeout via AbortController. Falls back gracefully on error.
- Sends only the persona fields the prompt actually uses (not the whole persona object) — good data-minimization practice.

**What the Orchestrator replaces:**
The Orchestrator splits this single prompt into two (Step A + Step B). The existing `api/infer.js` can remain as a fallback endpoint for the transition period, or be retired once the two-step flow is live. The Orchestrator's Step B prompt is a superset of the existing prompt's logic — it adds `schedule_hint`, `decomposition_candidate`, and uses the fuller persona summary from Step A instead of a 5-field subset.

**What the Orchestrator preserves:**
- The Mistral API integration pattern (Vercel → Mistral, `mistral-small-latest`, `response_format: json_object`, temperature 0.2, 8s timeout).
- The data-minimization principle (only forward what each prompt needs).
- The graceful fallback behavior (return null on failure, let the frontend fall back to rule-based).

### `api/decompose.js` — existing decomposition stub

**What's there:**
- Separate Vercel serverless function, POST-only, requires `MISTRAL_API_KEY`.
- Own `SYSTEM_PROMPT` — "is this intent decomposable? If yes, propose 3-6 subtask texts."
- Returns `{decomposable: bool, subtasks: string[]}`.
- Called on demand when user opens an intent (`fetchDecomposition()` in `app.js`), never at capture time.

**What the Orchestrator does with it:**
The Orchestrator's Step B prompt outputs `decomposition_candidate: true|false` as a signal. This is NOT the same as calling `api/decompose.js` — it's a lighter-weight signal that says "this intent might be worth decomposing." The actual decomposition flow (propose/edit/approve) remains in `api/decompose.js` + `renderDecomposeProposal()` in `app.js`. The Orchestrator doesn't replace decomposition — it just adds an early signal so the frontend can consider decomposition before the user even opens the check-in.

**What stays untouched:**
- `api/decompose.js` — no changes needed. The Orchestrator doesn't call it; the frontend's existing `fetchDecomposition()` does.
- The decomposition decision that subtasks are full intents (`parent_intent_id`/`subtasks`), AI proposes but user approves, no forced sequencing, rollup check-in — all unchanged.

### `frontend/web/app.js` — existing frontend orchestration

**What's there:**
- `inferDecision(intent)` — calls `/api/infer`, returns decision or null.
- `openCheckin(id)` — dispatches decomposition first, then `runCheckin()`.
- `runCheckin(intent, id)` — calls `inferDecision()`, renders based on result, falls back to rule-based if AI fails.
- `framingCopy(intent, framing)` — returns copy objects for direct + inquiring.
- `isAmbiguous(intent)` — rule-based A/C and B/E proxy (vague text + repeat stalled).
- `renderNotSure(intent, why)` — "not sure" fallback UI.
- `renderCheckin(framing, why)` — check-in UI from framing + why.
- `setCheckinSource(kind, label)` — debug label showing AI vs fallback.

**What the Orchestrator changes:**
- `inferDecision()` becomes the Orchestrator's Step B call (with Step A cached or on-demand). The function signature stays the same — it still returns `{moment, urgency, receptivity, framing, why}` or null — so the rest of `app.js` doesn't change. The Orchestrator is behind this interface.
- `runCheckin()`'s fallback behavior is unchanged — if the Orchestrator's calls fail, it falls back to the rule-based/manual flow.
- The `setCheckinSource("auto", `mistral · ${decision.moment} · ${decision.urgency} urgency`)` line may need updating to reflect the two-step pipeline (e.g., `mistral · Step A persona confidence 0.35 · Step B moment B`), but this is a minor cosmetic change.

**What stays untouched:**
- All rendering functions (`renderFeed`, `buildFeedRow`, `framingCopy`, `renderCheckin`, `renderNotSure`, `renderDecomposeProposal`, `renderGlobalRollup`).
- All state transition helpers (`resolve`, `defer`, `stall` — in `intents.js`).
- The Recovery Mode entry gate (`maybeEnterRecovery()`).
- The radio picker change handlers.
- The decomposition flow (`fetchDecomposition`, `renderDecomposeProposal`, `commitDecomposition`).

### What's missing / what the Orchestrator adds

| Missing | Orchestrator adds |
|---|---|
| No separate persona-read step | Step A prompt + cached persona summary |
| No schedule_hint in the decision output | Step B prompt outputs `schedule_hint` for the Reminder Agent |
| No decomposition_candidate signal | Step B outputs `decomposition_candidate` as an early signal |
| `api/infer.js` sends only 5 persona fields | Step A sends the full `onboarding_profile` + `inferred_patterns`; Step B gets a compact summary |
| No persona confidence propagation | Step A's `persona_confidence` flows into Step B's receptivity decision |
| No event-driven capture subscription | Orchestrator subscribes to `blurt:intent-captured` (or polls localStorage as fallback) |

---

## 5. MVP vs Full Product Deployment Considerations

### MVP (Vercel + Mistral, current scaffold)

**What stays on Vercel:**
- Step A and Step B prompts both run as Vercel serverless functions (or one function with two internal turns). Same pattern as `api/infer.js` — the one place `MISTRAL_API_KEY` lives.
- The Orchestrator's prompts are deployable as-is on Vercel: they're just system prompts + a fetch to Mistral's API, same shape as the existing stubs.
- The frontend's `inferDecision()` → Orchestrator Step B call stays a single `/api/orchestrator` endpoint (or two calls — see below).

**Two-call vs one-call MVP decision:**
The spec says Step A and Step B are separate prompts. For MVP on Vercel, there are two options:

- **Option 1 — Two Vercel endpoints:** `/api/persona-read` (Step A) and `/api/reminder-plan` (Step B). The frontend calls Step A first (or uses a cached summary), then Step B. Clean separation, but two network round-trips per check-in.
- **Option 2 — One Vercel endpoint that does both internally:** `/api/orchestrator` receives the intent + full persona, runs Step A's prompt first (getting the summary), then runs Step B's prompt with that summary, returns the reminder plan. One round-trip, still two logical prompts, easier to cache Step A's result server-side between calls. **Recommended for MVP.**

**Persona cache for MVP:**
Since `inferred_patterns` is empty during self-test (no interaction log yet), Step A's output is deterministic from `onboarding_profile` alone. The Orchestrator can cache the persona summary keyed by `user_id` + `onboarding_profile` hash + `inferred_patterns` hash, invalidating when the Persona Agent updates `inferred_patterns`. For MVP with no Persona Agent yet, the cache is just "compute once per onboarding, reuse until onboarding changes."

### Full product (Render, future)

**What moves to Render:**
- The Orchestrator's two prompts become persistent services (not serverless functions) that can hold a warm persona cache, subscribe to a message queue for `blurt:intent-captured` events, and batch Step A recomputations when `inferred_patterns` changes.
- The Reminder Agent's scheduling logic (which consumes `schedule_hint`) also moves here, since it needs persistent state (when to fire, what channel, what copy).
- The Persona Agent's inference pass (LLM re-analysis of `interaction_log` → `inferred_patterns`) runs here too, on a schedule, not on every capture.

**What the prompts need to stay deployable in both contexts:**
- Both Step A and Step B prompts are stateless — they take JSON input, return JSON output. No persistent state, no side effects. They work identically on Vercel (cold start per call) and Render (warm service with cached persona summaries).
- The prompts don't assume any particular transport (HTTP, queue, in-process). They're just prompt text + JSON I/O.
- The `schedule_hint` field is advisory — the Reminder Agent on Render decides how to use it. On MVP/Vercel, the frontend can ignore `schedule_hint` entirely (it doesn't have a Reminder Agent yet) without breaking the check-in flow.

### Privacy consideration (cross-cutting)

The Privacy Agent's draft decision is local-first, with Web Speech API as the one live exception (audio sent to Chrome/Edge servers). The Orchestrator's LLM calls are the *second* egress point (after Web Speech). The Orchestrator's prompts must be compatible with a future local-only mode where the LLM call is replaced by an on-device model or rule-based fallback. This means:
- The prompts should not assume a specific model provider (Mistral). They're prompt text — they work with any LLM that accepts system prompts + JSON output format.
- The Step B prompt's `receptivity: "unknown"` fallback when there's no interaction history is explicitly designed for the cold-start / local-only case where there's no behavioral data to draw on.
- If the Privacy Agent decides some intent categories (embarrassing, medical) should never leave the device, the Orchestrator needs a per-intent egress opt-out — Step B should be skippable for those intents, falling back to rule-based check-in. This is flagged as an open question for the team.

---

## 6. Open Questions for the Team

1. **Two-call vs one-call MVP:** Should Step A and Step B be two separate Vercel endpoints (clean separation, two round-trips) or one endpoint that runs both prompts internally (one round-trip, easier caching)? My recommendation is one endpoint for MVP, two for full product on Render — but the team should decide.

2. **Persona summary caching:** How aggressive should the cache be? For MVP with no `inferred_patterns` yet, the summary is static from onboarding. But once the Persona Agent starts writing `inferred_patterns`, how often should Step A recompute? On every check-in? On a timer? Only when `inferred_patterns` changes? This affects whether the Orchestrator needs a pub/sub mechanism or can just poll.

3. **`schedule_hint` consumption:** The Reminder Agent isn't built yet. Should the Orchestrator's Step B prompt include `schedule_hint` now (so the interface is ready when the Reminder Agent arrives), or defer it until the Reminder Agent is built? My recommendation: include it now with a clear "advisory, not a commitment" framing, since it's cheap to add and the Reminder Agent's interface needs to be defined somewhere.

4. **Decomposition candidate signal:** Step B outputs `decomposition_candidate: true/false`. Should the frontend act on this before the user opens the check-in (e.g., show a "this looks like multiple things — want to break it down?" prompt on the feed card), or only consider it when the user opens the item (current behavior)? The roadmap says decomposition happens on demand when the user opens the item, not at capture time — so the signal should probably stay latent until open, but the team should confirm.

5. **Egress opt-out for sensitive intents:** If the Privacy Agent defines intent categories that should never leave the device (embarrassing, medical, etc.), how does the Orchestrator know which intents to skip? A flag on the intent object? A category field? The schema has `category` (inferred by Persona Agent) — could that carry an "opt-out" value? Needs coordination with the Privacy Agent and Persona Agent.

6. **Persona confidence threshold:** Step A's prompt uses 0.4 as the confidence threshold below which a field is treated as a weak hint. Is this the right threshold? It's a starting guess — the team should tune it against real data once the Persona Agent starts producing confidence scores.

7. **Prompt versioning:** The Step A and Step B prompts are going to evolve as the Persona Agent's inference matures and as real-use testing reveals where the prompts are getting things wrong. Should they be versioned (like the schemas)? If so, where — in the prompt text itself, in a separate version field, or in the Orchestrator's deployment config? The schema agent's versioning discipline (semver-ish, migrations before changes ship) is a good model to follow, but prompts aren't data — they're code. The team should decide how to track prompt changes.

---

*End of review.*
