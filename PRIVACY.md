# Privacy & Data-Handling

Owned by the Privacy Agent (AGENTS.md §7). Runs continuously, not a late-stage checklist.
This document is the source of record for Blurt's storage-boundary decisions, data-minimization review,
and the privacy-facing copy that surfaces to users in settings/privacy (mockup screen 11).

**Scope:** self-testing phase (Ismail, one device, `localStorage`-only). Decisions here are scoped to
that phase and must be revisited before any other tester onboards or before anything leaves the device.

---

## 1. Local-vs-Cloud Decision (explicit, with rationale)

**Decision:** Local-only for the self-test phase. Nothing leaves the device unless a reviewed, documented
exception applies.

**What is local-only (always, today):**
- Every captured intent (`intent.json` objects in `localStorage` key `blurt_intents_v0.1.0`)
- The user persona (`persona.json` shape in `localStorage`, key `blurt_persona_v0.2.0`)
- All onboarding answers, voice transcript analysis, interaction log, inferred patterns, active clarifications
- The `SpeechRecognition`/`saveIntent` flow (Capture Agent — see §3 for the one live network exception)

**What is the *only* planned egress point (if it ships):**
- The Orchestrator Agent's LLM calls: `/api/infer` (Mistral) and `/api/decompose` (task decomposition).
  These are Vercel serverless functions (scaffolded in `api/infer.js`, `api/decompose.js`). When the
  frontend calls them, it sends **text + a small slice of the onboarding persona profile** (the specific
  fields `inferDecision()` reads in `app.js` line ~193: `text`, `state`, `stall_count`, `captured_at`,
  `resolution_status`, and `persona?.onboarding_profile`). It does **not** send raw audio, the full intent
  history, or the full interaction log.
- This egress point is the one reviewed exception. It must be called out in the settings/privacy screen
  before it goes live, not after. The copy should say, in plain language, what leaves the device, why, and
  that it can be turned off (the app falls back to the rule-based/manual flow if the key is missing or the
  call fails — that fallback is the UX guarantee that "cloud" is never required to use Blurt).

**Rationale:**
- Self-testing on one person does not need cloud sync, cross-device, or analytics.
- Voice recordings + a behavioral/failure log is health-adjacent sensitive data. The source doc
  (`blurt-concept.md` §"Things I'd flag" #4) explicitly calls this out: deciding now avoids the painful
  re-architecture later if the product ever moves beyond Ismail and Tanvir.
- Retrofitting local-only after a cloud-first build is the painful path the source doc names. Doing it now,
  while storage is `localStorage` and LLM calls are stubs, is cheap.

**Revisit triggers (must re-review PRIVACY.md before any of these ship):**
1. A second tester onboards (per `OPEN_QUESTIONS.md` item 11 + `BLURT_STATE.md` standing caution —
   Ismail's mixed-subtype data is not generalizable).
2. Any new network egress point beyond `/api/infer` and `/api/decompose`.
3. Any storage migration off `localStorage` (e.g., a sync layer, a server DB, a backup).
4. Before the Capture Agent's transcription path changes from browser-native STT to anything else (see §3).

---

## 2. Opt-Out Categories for Sensitive Intent Types

**Open question from the source doc** (`blurt-concept.md` item 13): *Are there categories of intent people
don't want captured/analyzed at all (embarrassing, private, medical) that need an opt-out or local-only mode?*

**Recommendation (design, not yet implemented):** Define three opt-out tiers. Each tier is a per-intent
choice made at capture time, stored on the intent, and honored by every downstream agent.

### 2a. The categories (what users can exclude)

These are the categories the source doc names plus the ones the schema's `drop_prone_domains` field and the
onboarding `Q9` (`drop_prone_domains`) already have vocabulary for. Don't invent a new taxonomy — reuse the
existing domain vocabulary and add an explicit "do not analyze" flag.

| Tier | What it means | Stored as | Downstream effect |
|---|---|---|---|
| **Local-only capture** | The intent is captured and stored, but never sent to any LLM call. It still gets the normal state machine and reminder loop, just rule-based, never cloud. | `capture_method`-adjacent flag, e.g. `analysis_scope: "local_only"` on the intent | `inferDecision()` skips the `/api/infer` call for this intent; falls back to rule-based framing. `fetchDecomposition()` skips `/api/decompose`. |
| **Category excluded from persona inference** | The intent is captured, stored, reminded, and resolved normally — but its text and outcome are **not** fed into `inferred_patterns` or the `interaction_log` inference pass. It does not teach the persona anything. | The existing `category` field on `intent.json` (written by Persona Agent) plus a new opt-out list on the persona, e.g. `excluded_inference_categories: ["medical", "private"]`. | Persona Agent's inference pass filters these out before writing `inferred_patterns`. Reminder Agent can still act on them. |
| **Do not capture at all (global / per-category toggle)** | A settings-level list of intent-category keywords or categories that, when matched at capture time, silently drop the intent with no storage. For the self-test phase this is a local setting; if the product ever adds a server side it must remain enforceable client-side. | Settings store (e.g. `blurt_excluded_categories` in `localStorage`), checked by `saveIntent()` before writing. | `saveIntent()` returns without writing. Capture UI shows a brief "skipped" note, not a confirmation — don't confirm what you didn't store. |

### 2b. How the opt-out works (UX)

- **Per-intent, at capture time, not a hidden filter.** The Capture Agent's `saveIntent()` is the choke point.
  If there's an opt-out UI, it sits at the capture surface, not buried in settings. For voice capture this is
  the hard case — a spoken intent can't easily carry a tap-to-exclude. The typed fallback path can show a small
  "not for analysis" checkbox; the voice path's answer for the self-test phase is: voice intents default to
  **local_only** for anything the user hasn't explicitly said is fine to analyze, until there's a reviewed
  voice-category UI. This default is conservative and should be documented, not silently shipped.
- **Per-category, stored on the persona.** The `excluded_inference_categories` list lives on the persona object,
  not on each intent, so it survives across the whole interaction log. The Persona Agent reads it before writing
  `inferred_patterns`.
- **Global toggle exists as a backstop.** A single "capture everything locally, never analyze" switch is the
  simplest on-ramp for a user who doesn't want to think about categories. It maps to Tier 1 (local_only) for all
  new intents and Tier 2 (excluded from inference) for the existing log. No tier removes already-stored data —
  that's the deletion path (§4).

### 2c. What the categories are (initial proposal)

Reusing the onboarding `Q9` `drop_prone_domains` vocabulary and the source doc's named sensitive types:

- **`medical`** — anything about symptoms, medications, appointments, bodily functions. Flagged in the source doc
  explicitly. Highest-sensitivity; default to excluded-from-inference for voice captures until the user opts in.
- **`private`** — anything the user wouldn't want surfaced in a check-in or inferred into a pattern. Broad bucket;
  the user names it, not the app.
- **`embarrassing`** — the source doc's named category. Social-context-sensitive intents (around other people,
  awkward to have stored). Often overlaps with `private`.
- **Domain-matched opt-out (reuse existing vocabulary):** `work_study`, `home_admin`, `people`, `self_care`, `even`
  — if a user excludes e.g. `self_care` from inference, nothing in that domain teaches the persona. This is the
  narrow, non-embarrassing case: a user may want reminders for self-care tasks but not want the persona to learn
  "this person drops self-care a lot."

**Open question for the team:** Does `category` on `intent.json` (currently written by the Persona Agent as an
*inferred* task category) need a parallel *user-declared* sensitivity marker, or do we add a new field
(e.g. `sensitivity: "local_only" | "excluded_from_inference" | null`)? The schema Agent should own this — it's a
schema change, and `category` is currently described as "Inferred task category, written by Persona Agent." A
user-declared sensitivity flag is a different field with a different writer (Capture Agent at save time). Don't
overwrite `category`'s semantics.

---

## 3. Voice Data Handling — Browser-Native STT vs. On-Device Whisper (current gap, migration path)

### 3a. Current state (the live privacy flag)

`capture/web/app.js` uses the browser-native Web Speech API:
```js
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
```
This is the **only implemented transcription path today.**

**What actually happens to the audio:**
- In Chrome/Edge: the raw microphone audio is sent to Google's servers for transcription. The user's voice
  leaves the device. This is a real, week-one exception to "local-first," not a hypothetical. It is called out
  in `CLAUDE.md` ("Chrome/Edge's SpeechRecognition sends raw audio to the vendor's server") and in the Capture
  Agent's `REVIEW.md` (§1, item 2; §3, "Privacy flag").
- In Safari: support is partial (the Capture Agent's `REVIEW.md` notes this); behavior differs, but the privacy
  concern is similar — browser-native STT is a vendor-mediated path, not on-device by default.

This is the single most important privacy flag in the current build. The "local-first" claim in §1 is accurate
*except* for this path, and that exception must be visible to the user, not hidden.

### 3b. What the settings/privacy screen must say (today, before any other tester)

A plain-language line in settings/privacy (mockup screen 11) — this is not optional, it's the UX version of the
flag:

> **Voice capture (today):** When you use the microphone, your audio is sent to Google's servers for transcription
> in Chrome/Edge. Nothing is stored on their side beyond what the browser's speech service needs to transcribe —
> Blurt only keeps the transcribed text. This is a known, scoped exception to Blurt's local-first default, and
> it's why the typed fallback exists. We're working toward on-device transcription so voice stays on the device.
> If you'd rather not use voice capture today, the typed input does not send audio anywhere.

### 3c. Target state (on-device Whisper)

The Capture Agent's `REVIEW.md` §3 specifies the target pipeline:
```
User speaks → audio captured → on-device Whisper (WASM) → transcribed text → raw intent.json event
```

Two layers, in priority order:

1. **Primary — on-device Whisper (WASM).** Whisper.cpp compiled to WebAssembly, or `transformers.js` with a
   Whisper model loaded in-browser. Audio never leaves the device. This is the privacy-first path and matches
   the local-only posture. The Capture Agent's `REVIEW.md` §3 names this as primary.
2. **Fallback — cloud Whisper API.** If on-device Whisper isn't available (e.g., the PWA is in a browser without
   WASM Whisper, or the device can't run it), stream audio to a Whisper API endpoint (OpenAI Whisper, or a
   self-hosted instance). This is the "Whisper-flow" style — streaming transcription as audio arrives, not waiting
   for the full utterance. **This fallback is still an egress point and must be documented the same way as the
   current browser-native flag.**

### 3d. Migration path (ordered)

1. **Document the current flag now** (this §3b) — required before the self-test phase grows beyond Ismail.
2. **Prototype on-device Whisper in the PWA.** The Capture Agent should test whether WASM Whisper runs acceptably
   in-browser on the target devices. The `REVIEW.md` §7 item 2 already raises this as an open question: "WASM-on-device
   (privacy-first, no network) or cloud Whisper API (simpler, needs network)?" The privacy-first posture says on-device
   first; the performance/footprint tradeoff is the thing to test.
3. **Swap the default transcription path** from `SpeechRecognition` to on-device Whisper once it's validated. The
   browser-native path becomes an explicit fallback (with the same plain-language flag) only when on-device isn't
   available.
4. **Do not remove the typed fallback.** The source doc's open question (does speaking out loud in public defeat
   capture?) is a real failure mode, and the typed path is also the privacy-preserving option for users who don't
   want to speak at all. It stays.

### 3e. What "local-only for voice" means once on-device Whisper lands

Once the transcription path is on-device Whisper (or the typed fallback), voice capture is fully local: audio is
captured, transcribed, and discarded on-device; only the resulting text enters `localStorage` as the intent's `text`
field. No audio is stored. This is the target. Until then, §3b is the honest state.

---

## 4. Data Retention and Deletion (initial recommendation)

The source doc does not specify retention or deletion. This is the Privacy Agent's call to make an initial
recommendation. The existing `settings.js` already has an export and a delete-everything button — that's a good
starting point, and §4 recommends making it more granular.

### 4a. Retention — what stays, how long

- **Intents:** stored in `localStorage` until the user deletes them (individually or all at once) or clears browser
  data. No automatic expiry. Rationale: the whole point of the interaction log is longitudinal pattern inference, and
  an ADHD user's "I forgot I even captured this" is common — auto-deleting intents would silently destroy the signal
  the persona is built from.
- **Persona:** stored indefinitely alongside intents, same justification.
- **Voice audio:** not stored at all in the current path (only the transcript is kept). In the on-device Whisper path,
  audio is also not stored — transcribed and discarded. **Blurt does not keep voice recordings.** If a future path ever
  does (e.g., for a re-transcription feature), that needs its own retention policy and its own opt-out.

### 4b. Deletion — what the user can do

The existing `settings.js` delete button (`delete-data`) removes:
- `blurt_intents_v0.1.0` (all intents)
- `blurt_persona_v0.2.0` (persona)
- `blurt_onboarded_v1` (onboarding flag)
- `blurt_last_open` (last-open timestamp)
- `sessionStorage` recovery flag

This is a **delete-everything** operation with a confirm dialog. It is good and should stay. Recommend adding:

1. **Delete a single intent** from the feed/task detail — a "delete" action on an individual card, not just the
   nuclear settings button. This is the everyday deletion path; the settings button is the reset path.
2. **Delete by category or time window** (settings-level) — e.g., "delete all intents older than N days" or
   "delete all intents in category X." For the self-test phase this is a nice-to-have; for any multi-user future it
   becomes more important.
3. **Export before delete** — the existing export button writes a JSON file with intents + persona. Recommend making
   the delete dialog offer "Export first" as a one-click step, because a user who clicks delete may not have exported
   recently. Not required for self-test; cheap to add.

### 4c. Export

The existing `export-data` button in `settings.js` exports a JSON blob with `exported_at`, `intents`, and `persona`.
This is sufficient for the self-test phase. Recommend:
- Keep the export format stable and documented (it's a JSON dump of the two `localStorage` stores). If the schema
  version changes, the export should reflect the migrated shape, not the raw stored shape — export is a user-facing
  artifact, not an internal one.
- If a cloud sync path ever exists, export is also the "take your data and leave" path. The settings/privacy screen
  should say: "You can export everything Blurt knows about you at any time from Settings."

### 4d. What Blurt does *not* do (state this explicitly)

- No analytics, no crash reporting with user data, no usage telemetry that leaves the device in the self-test phase.
- No cross-user persona pooling (enforced by `AGENTS.md` convention and `schema/persona.json`'s description —
  "Never pooled or generalized across users").
- No third-party scripts that collect intent text or persona data. The only network calls in the current build are
  `/api/infer` and `/api/decompose`, and those receive a bounded slice of text + persona fields, not the full store.

---

## 5. Review of Other Agent Outputs for Scope Creep

Reviewed against: `capture/REVIEW.md`, `frontend/web/app.js`, `frontend/web/settings.js`, `frontend/web/intents.js`,
`schema/intent.json`, `schema/persona.json`, `persona/README.md`, `reminder/README.md`, `orchestrator/README.md`,
`frontend/README.md`, `OPEN_QUESTIONS.md`, `BLURT_STATE.md`.

### 5a. Capture Agent (`capture/web/`, `capture/REVIEW.md`) — **within scope, one live flag**

- Capture stays dumb: `saveIntent()` writes the raw transcript, no analysis. ✅ Conforms to the `AGENTS.md` "capture
  stays dumb" principle.
- The `capture_method` enum (`voice`, `typed_fallback`) is correct and complete. ✅
- The one overreach risk is not in capture itself but in the *default transitivity* of voice: a voice capture that
  goes through browser-native STT sends audio off-device *and* the resulting text is then available for every downstream
  agent. The privacy fix for the STT path is §3; the fix for the downstream transitivity is §2 (opt-out) — a voice
  capture should be able to land as `analysis_scope: "local_only"` without the user having to re-speak it.
- **No scope creep in capture itself.** The `REVIEW.md` is honest about what's missing (access point, Whisper, widget)
  and doesn't pretend those are built.

### 5b. Frontend / Render Agent (`frontend/web/`) — **within scope, watch the inference payload**

- `app.js` is a thin rendering layer plus the step-4 `inferDecision()` call. The rendering layer does not collect data
  beyond what the schema already defines. ✅
- **Flag — the `/api/infer` payload is bounded but should be audited as the persona grows.** Today `inferDecision()`
  sends `text`, `state`, `stall_count`, `captured_at`, `resolution_status`, and `persona?.onboarding_profile`. The
  onboarding profile is a 10-field object. Today that's fine. The risk: if the persona later accumulates a long
  `interaction_log` or a large `inferred_patterns`, and `inferDecision()` is changed to send more of it "for better
  inference," that is scope creep into the egress point. The Orchestrator Agent's design constraint (separate persona-read
  and reminder-plan-write steps, from `orchestrator/README.md`) should be read as a privacy constraint too: send only
  what the inference step needs, not the whole persona. **Recommend: put a hard cap on the `persona` slice sent to
  `/api/infer` — only the fields the prompt actually uses — and don't expand it without re-reviewing PRIVACY.md.**
- The `renderGlobalRollup()` path (mockup screen 13) aggregates pending subtasks + resurfacing items into one view.
  This is a UI aggregation, not a new data collection — it reads the existing store. ✅ Not scope creep, but note it
  for the record: aggregation is not collection.
- `settings.js` export + delete are within scope and good. ✅ See §4.

### 5c. Persona & Inference Agent (`persona/README.md`, `schema/persona.json`) — **within scope, overfitting instrumentation is the right call**

- The persona is per-user isolated, never pooled. ✅ Matches the source doc's design principle and `AGENTS.md`.
- Passive signal (interaction log) + active signal (micro-questions) — both are within the source doc's spec. ✅
- The `inferred_patterns.confidence` field is exactly the overfitting instrumentation the source doc asks for
  (`blurt-concept.md` item 3, `AGENTS.md` Persona Agent §"Overfitting instrumentation"). ✅ This is good, not creep —
  confidence metrics are a *limitation* signal, not a data grab.
- **Flag — the interaction log is append-only and can grow indefinitely.** This is within scope (it's the source doc's
  design), but it's the one place where "local-only" can quietly become "local-only but large." For the self-test phase
  this is fine. Recommend: the Persona Agent's inference pass should periodically prune or summarize the interaction log
  rather than re-reading the whole thing forever — not for privacy, but because a forever-growing log is a future
  retention decision that should be made consciously. This is a recommendation for the Persona Agent, not a scope-creep
  flag on the current build.

### 5d. Reminder & Tone Agent (`reminder/README.md`) — **within scope, no collection**

- The Reminder Agent reads `resolution_status`, `inferred_patterns.best_reminder_windows`, and the interaction log. It
  does not collect new data beyond what the schema defines. ✅ No scope creep. The copy/tone prototyping is exactly what
  the source doc flags as the hardest design problem — right work, no extra collection.

### 5e. Orchestrator / System-Prompt Agent (`orchestrator/README.md`) — **within scope, the egress point is the watched field**

- The Orchestrator is the only agent that *sends* data off-device (via `/api/infer`, `/api/decompose`). Its design
  constraint — separate persona-read and reminder-plan-write steps — is also a privacy constraint. ✅ As long as the
  persona-read step sends only what the prompt needs (see §5b flag), this is within scope.
- **Watch item:** `api/infer.js` and `api/decompose.js` are Vercel serverless stubs. Their actual prompt content and
  what they do with the payload is not yet reviewed here — the Orchestrator Agent owns that. When the Orchestrator Agent
  writes the system prompt, the Privacy Agent must review what fields the prompt asks for and confirm the frontend sends
  no more than that. This is a revisit trigger (§1, item 2).

### 5f. Schema (`schema/intent.json`, `schema/persona.json`) — **within scope, one recommended addition**

- `intent.json` 0.3.0 and `persona.json` 0.2.0 are within the source doc's spec. ✅
- **Recommended schema addition (Privacy Agent → Schema Agent):** a `sensitivity` field on `intent.json` (or a
  `excluded_inference_categories` list on `persona.json`) to carry the opt-out tiers from §2. This is a schema change
  and must be proposed to the Schema Agent, not added unilaterally. See §2c open question. Do not overload the existing
  `category` field (described as "inferred task category, written by Persona Agent") with a user-declared sensitivity
  marker.

### 5g. Overall assessment

No agent is collecting data beyond what the schema defines. The scope-creep risk is not in any single agent's current
output — it's in the *combination*: voice capture → browser-native STT (off-device audio) → text in `localStorage` →
`/api/infer` payload (text + persona slice). Each step is individually reasonable; the chain is what needs the §3 and §2
guards. The two highest-priority additions before any other tester: (1) the §3b settings/privacy copy, and (2) the §2
opt-out tiers (at minimum, the "local_only" flag on voice captures as a default).

---

## 6. Open Questions for the Team

1. **Opt-out schema shape:** Does `intent.json` get a new `sensitivity` field, or does the persona get an
   `excluded_inference_categories` list (or both)? Schema Agent to propose. Don't overload `category`.
2. **Voice default for self-test:** Should voice captures default to `analysis_scope: "local_only"` until the user
   explicitly opts into cloud inference? Conservative default recommended; needs team agreement.
3. **On-device Whisper timeline:** Is WASM Whisper a v1 goal or later? The Capture Agent's `REVIEW.md` §7 item 2
   raises this. Privacy-first says on-device first; performance/footprint is the thing to test. Until it lands, §3b
   copy is required.
4. **Settings/privacy screen copy:** Who writes the plain-language privacy copy for mockup screen 11? The Privacy Agent
   drafts it (this doc is the source); the Frontend Agent puts it on screen. Needs coordination.
5. **Deletion granularity:** Add single-intent deletion from the feed/task detail before any other tester? Recommended.
   Add "delete by time window / category" in settings? Nice-to-have for self-test; required before multi-user.
6. **Inference payload cap:** Hard-cap the `persona` slice sent to `/api/infer` to only the fields the prompt uses.
   Orchestrator Agent owns the prompt; Privacy Agent reviews the cap before it ships.
7. **Interaction log pruning:** Should the Persona Agent summarize/prune the interaction log over time? Not a
   privacy blocker for self-test, but a future retention decision that should be made consciously, not by inertia.
8. **What happens when a second tester onboards:** Re-review this entire doc before that happens. Add a revisit trigger
   to the build checklist (AGENTS.md / Notion roadmap) so it's not missed.

---

## Status

No longer draft. The local-vs-cloud decision (§1), the voice-data handling policy with the current gap and migration
path (§3), and the scope-creep review (§5) are decided. The opt-out categories (§2) and retention/deletion policy (§4)
are recommendations awaiting team agreement on the schema shape and UI copy. All open questions are tracked in §6 and
jointly in `OPEN_QUESTIONS.md` item 13.
