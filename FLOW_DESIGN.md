# Blurt — Flow Design (spec of record)

Written after reading the full repo (`blurt-concept.md`, `AGENTS.md`, `BLURT_STATE.md`, `ROADMAP.md`,
`OPEN_QUESTIONS.md`, `PRIVACY.md`, all of `schema/`, all of `frontend/web/`, `capture/web/`, `landing/`).
This is the flow spec of record going forward — read it before touching any screen. Where it conflicts
with `BLURT_STATE.md`'s session logs, this doc wins (it was written after reading the actual current
code, not a log of past sessions). Where it conflicts with `blurt-concept.md` on *why* the product
exists, `blurt-concept.md` wins — this doc is about *flow*, not re-litigating the concept.

---

## 1. What this product is, in one paragraph

Blurt is not a to-do app. The problem it solves is **intent decay**: a fleeting intention forms
("I should cut my nails") and dies before it ever reaches a list, because forming the intention and
organizing it are two different mental steps and the second one is unreliable for this user. So Blurt
removes the second step. Capture is one tap, no decisions. Everything after capture — when to bring it
back, how to word it, what counts as "resolved" — is the system's job, driven by a private, per-user
persona, not the user's.

## 2. Non-negotiable invariants

These are product decisions already made and tested against the concept doc. Do not redesign them.
Any flow change must be checked against this list before it ships.

1. **Capture stays dumb.** The capture screen (`capture/web/`) never analyzes, categorizes, or asks a
   follow-up question. It writes a raw `intent.json` record and nothing else. Zero decisions at the
   moment of capture, ever.
2. **No streaks, counts, overdue badges, or red.** Nothing in any screen should communicate "you are
   behind." A resting state renders no tag at all — absence of a tag *is* the calm state.
3. **"Let it go" is a real, equal-weight outcome**, not a failure state. It must never be visually or
   verbally demoted relative to "done."
4. **Resolution is not binary.** Every check-in surface must offer the fuller vocabulary: done / not
   yet / did it another way / let it go — never a single checkbox.
5. **No due dates by default.** A deadline exists only if the user explicitly confirms one
   (`deadline_confirmed_absent` gates re-asking). Never infer urgency from absence of a date.
6. **Framing is decided for the user, from their persona — never a menu the user picks from in
   production.** The `direct` / `inquiring` radio toggle in `index.html` is a **dev-only build
   instrument** (`?dev=1`), permanently. It must never render for a real user.
7. **No repeated nagging.** A missed check-in either gets a plain re-ask (`inquiring`) or, once
   receptivity looks low, folds into Recovery Mode (`silent-recovery`) — it never repeats the same
   nudge on a fixed interval.
8. **The persona is private and per-user.** Never pool, aggregate, or generalize data across users.
   There is currently only one user (self-test); do not add multi-user/account infrastructure without
   an explicit go-ahead — see §8.
9. **Local-first.** `localStorage` is the store of record. The only two egress points are
   `/api/orchestrator` (check-in framing) and `/api/decompose` (task breakdown), and both must
   degrade to a rule-based/local fallback if the call fails or no key is set — the app must never
   break for lack of `MISTRAL_API_KEY`.
10. **Decomposition is proposal-only.** An AI-suggested breakdown into subtasks is never auto-committed.
    The user approves, edits, or declines every time. No "break this down" button exists in v1 — it's
    judged automatically when an item is opened.
11. **One product vocabulary.** See the retired/canonical word table in `frontend/README.md`. Do not
    reintroduce a synonym for an already-named concept (e.g. never say "Archive" or "Completed" —
    the canonical words are "Let it go" and "Done").
12. **Internal taxonomy never reaches a real user.** Model/vendor names, state-machine identifiers
    (`dormant`, `flagged_for_recovery`, etc.), env var names — none of this is user-facing copy, ever.
    It's fine behind `?dev=1` only.

## 3. Screen map (the full flow graph)

```
Landing (/)  →  "Open the app" / "Start with setup questions"
                          │
                          ▼
              frontend/web/  (entry gate, index.html load)
                          │
         ┌────────────────┴─────────────────┐
   first run?                          returning user
         │ yes                                │ no
         ▼                                    ▼
   Onboarding (10 Qs, 3 passes)      maybeEnterRecovery() check
         │                                    │
   (Q1 overwhelm → early exit          triggered?──yes──▶ Recovery Mode
    after Q3, else all 10 + optional          │no
    voice prompt at the end)                  ▼
         │                              Home Feed
         └──────────────────────────────────►│
                                              │
              ┌───────────────┬──────────────┼───────────────┬──────────────┐
              ▼               ▼              ▼               ▼              ▼
       Capture (FAB)   tap open item   tap rollup entry   Settings icon   (nothing else
     (separate PWA,     (not a subtask)  (only visible if                  on this screen)
      /capture/web/)         │            a parent has                        │
              │               ▼            pending steps)                     ▼
      writes intent,   decomposable?             │                    Settings screen
      returns to feed   ┌────┴────┐               ▼                    │        │
                        yes       no      Rollup check-in         Review     Export/
                        │          │       (one parent at          (10-Q      Delete
                        ▼          ▼        a time)                 resumable
                Decompose      Check-in                                edit)
                 Proposal      (auto-inferred
                 (approve/      framing, or
                 edit/decline)  rule fallback)
                        │          │
                        ▼          ▼
                 commits subtasks  resolve/defer/stall the intent
                 (full intents)    → feed re-renders
                        │
                        ▼
              tap a parent-with-subtasks row from feed
                        │
                        ▼
                 Task Detail (grouped: has-date / no-date / closed,
                 one focused card at a time, deadline-confirm prompt,
                 add/remove steps, "let the whole thing go")
```

Two apps share one `localStorage` origin: `capture/web/` (the always-available "just say it" surface,
its own PWA) and `frontend/web/` (home feed, check-ins, onboarding, recovery, settings — also its own
PWA since 2026-08-14). They must be deployed same-origin or they will not share data. `landing/` is
the marketing page served at `/` (see `vercel.json`); it is not part of the app flow itself, it only
links into it.

## 4. Screen-by-screen spec

### 4.1 Landing (`landing/`)
- Static marketing page. Not part of the product flow — do not add app state/logic here.
- Two CTAs: "Open the app" (`/frontend/web/`) and "Start with setup questions"
  (`/frontend/web/onboarding.html`). Keep both; don't collapse to one.
- Content is a faithful restatement of `README.md`/`blurt-concept.md`. If concept copy changes,
  update this page to match — it must never overstate what's built (see the honest "where the project
  is" section — keep it honest, don't let it drift into marketing hype as features change).

### 4.2 Entry gate (`frontend/web/app.js`, bottom of file)
Runs on every load of `frontend/web/index.html`:
1. `hasCompletedOnboarding()` false → redirect to `onboarding.html`. Hard gate, no skip except the
   onboarding screen's own "Skip the questions" button.
2. Else `maybeEnterRecovery()` — redirects to `recovery.html` if either fires:
   - `stalledCount >= 3` (top-level items in `stalled` or `flagged_for_recovery`), or
   - `gapDays > gap_baseline_days` (the user's own Q7 answer).
   Session-scoped (`sessionStorage`), so it can fire again next session even if shown once already —
   do not make this a permanent dismiss.
3. Else render the Home Feed.

Do not add more gates here without checking this sequence — order matters (onboarding must always win
first; recovery must never interrupt onboarding).

### 4.3 Onboarding (`onboarding.html` / `onboarding.js` / `questions.js`)
- Welcome → 10 questions (one per screen, single-select pill, tap advances via Next; Skip always
  available) → optional voice prompt → feed.
- Progress indicator is a **quiet segmented bar**, never "Question N of 10" or a percentage.
- `entry_state` (Q1) answers of `overwhelmed_full` or `foggy` end the flow early, right after Q3
  ("gentle exit"), and go straight to capture. Never make an overwhelmed user finish all 10.
- Voice prompt is the last step, optional, framed as "tell me about one that got away" — not part of
  the required flow.
- `adhd_subtype` is never asked. Do not add a subtype/diagnosis question back in — this was a
  deliberate reversal, not an oversight.
- The 10 `QUESTIONS` live in `questions.js`, shared with `review.js`. Any wording change must be made
  there once — never duplicate the array.

### 4.4 Home Feed (`index.html` / `app.js`)
- One list. Subtasks never appear here directly (decomposition decision — they surface through their
  parent). Closed items (`resolved`/`dropped`) sit in a separate, visibly dimmed "Closed this week"
  section below the open ones — still visible, never deleted from view.
- Each row shows text + at most one tag. A decomposed parent shows "`N` steps left" instead of its own
  state tag. Tag copy always goes through `stateLabel()` (`intents.js`) — never hardcode a raw state
  string into a template.
- Tap a plain item → check-in flow (§4.6). Tap a decomposed parent → Task Detail (§4.8), never the
  check-in sheet (checking in "on the text" doesn't make sense once real subtasks exist).
- Rollup entry button (only visible when ≥1 parent has pending subtasks) → Rollup check-in (§4.7).
- FAB → `/capture/web/` (separate app/origin path, not a modal).

### 4.5 Capture (`capture/web/`)
- One primary control: the mic. Tap to start, tap anywhere on screen to stop, or type in the fallback
  field. No screen transition on save — a toast confirms and fades, the screen doesn't change.
- Interim transcript renders live as a preview only; the record is written on the **final** result,
  never on interim text.
- Unsupported-browser (Safari/Firefox) copy explains what still works ("voice needs Chrome or Edge —
  typing works anywhere"), never a bare "not supported."
- Dispatches `blurt:intent-captured` after every save — downstream agents subscribe to this event
  rather than polling `localStorage`. Keep emitting it from any new capture entry point you add.

### 4.6 Check-in (`#checkin` sheet in `index.html`, driven by `app.js`)
Entered via `openCheckin(id)`. Order of operations, do not resequence:
1. If the intent is top-level and not yet decomposed → `fetchDecomposition()`. If it comes back
   decomposable with ≥1 subtask → render the Decompose Proposal (§4.6a) instead of a check-in.
2. Otherwise → `runCheckin()`: call `/api/orchestrator` for `{moment, urgency, framing, why,
   activation_step}`.
   - Success + a usable framing → render that framing's copy (`framingCopy()`).
   - Success but `moment === "not_sure"` or missing framing → render the neutral "not sure" screen
     (§4.6b).
   - Call fails/times out/no key → fall back to the rule-based path: `isAmbiguous()` (vague text or
     `stall_count >= 2`) routes to "not sure"; otherwise use the (dev-only) manually-picked framing.
3. Four framing copy variants exist (`framingCopy()` in `app.js`) — **all four must stay wired**, none
   silently collapsed to `direct`/`inquiring`:
   - `direct` — plain restatement of the task, three actions (Done / Not yet / Did it another way).
   - `inquiring` — "Still on your mind, or can this go?", quoting the intent text.
   - `activation-only` — shows **only** a model-supplied `activation_step` (the smallest next physical
     action), never the full task text. If no usable step comes back, degrade to `direct` copy — never
     invent a first step client-side.
   - `silent-recovery` — shows no task text or question at all; folds the item into
     `flagged_for_recovery` immediately (before any button is even tapped) and offers "That's fine" /
     "Let's look now" (re-renders as `inquiring` in place) / "Let it go".
4. "Why now?" is always its own collapsed-by-default disclosure (`checkin-why-toggle`) — never
   concatenated into the main body text, and never asserts a time window the data doesn't back
   (e.g. never say "mentioned twice this week" unless something actually counts that).
5. Closing: every check-in screen exits via one of its own labeled buttons, or by tapping the
   backdrop. There is no separate "X close" icon — don't add one.

**4.6a Decompose Proposal** (`renderDecomposeProposal`): AI-proposed subtask rows, each with a
round check toggle (include/exclude, not a delete button) and an editable text field, plus "+ Add a
step." Primary button reads "Keep these N" (or "Keep this step" for N=1); ghost button "Leave it as
one thing" falls through to the normal check-in for the original, undecomposed intent. Nothing commits
until "Keep these N" is tapped.

**4.6b "Not sure"** (`renderNotSure`): neutral two-button ask — "Still on that" (defer) / "Something
new" (resolve as `no_longer_relevant`). This is the confusable-moment-pair fallback (Section 3.1's
A/C, B/E pairs) — keep it rule-based and cheap; don't wire it to another LLM call.

### 4.7 Rollup check-in (`renderRollup`)
- **Scope: exactly one parent per pass** — the first top-level intent with pending subtasks. This was
  deliberately reverted from an earlier "merge everything into one global catch-up screen" design.
  **Do not reintroduce a global/merged rollup** — that reconciliation is closed, not open.
- Shows every pending subtask of that one parent as a row with Done/Not yet. Exit only via "That's
  enough for now" — never auto-advance to the next parent in the same session.
- If no parent has pending subtasks: "All caught up," single exit button.

### 4.8 Task Detail (`task.html` / `task.js`)
Reached only from a decomposed parent's feed row.
- Three groups, rendered in this order: **Has a date** (sorted by date, nearest first) → **No date**
  → **Closed**. Only render a group if it has rows.
- Exactly one "focused" card is expanded at a time (bigger card with hint text + actions); everything
  else is a plain tappable row. Tapping a plain row promotes it to focused.
- No-date group: the first not-yet-asked subtask gets an expanded deadline prompt ("Pick a date" /
  "There isn't one" → sets `deadline_confirmed_absent`). Only ask one at a time — never prompt the
  whole group simultaneously.
- "+ Add a step" appends a real intent with `parent_intent_id` set — subtasks are never a separate
  schema.
- "Let the whole thing go" resolves the **parent** as `no_longer_relevant` and returns to the feed.
  Subtask states are untouched — parent/subtask resolution is independent in both directions, always.
- Known, accepted gap: the mockup's flat/day-chip layout differs cosmetically from this grouped/
  focused-card layout. This is closed as "functionally equivalent, lower priority" — **do not spend
  time reconciling it unless explicitly asked.**

### 4.9 Recovery Mode (`recovery.html` / `recovery.js`)
Strict 3-step order — do not reorder or compress:
1. Acknowledge return with **zero** reference to gap length or missed-item count. "Welcome back." Full
   stop.
2. One open question: "What's on your mind right now?" (voice or typed). This is itself a new capture
   — it writes an intent record.
3. Only after that response, surface up to 2 stalled items (ranked by `stall_count` then recency),
   one at a time, each `inquiring`-framed ("...still relevant?" / Still on my mind / Let it go). Never
   a list, never a count, never more than 2.
- Exits to the home feed once the queue is empty or immediately if there was nothing to surface.

### 4.10 Settings (`settings.html` / `settings.js`)
- Persona summary line (primary stall point) + secondary line (gap cadence + framing preference), both
  built from onboarding answers via the label maps in `settings.js` — never show raw enum values.
- "Local-first: Always on" — this has no other state until a real local-vs-cloud toggle is designed
  (see §8); don't turn it into a fake-functional switch.
- Export (`export-data`) → downloads a full JSON of intents + persona. Delete (`delete-data`) → confirm
  dialog, wipes all four `localStorage` keys + the session recovery flag, sends to onboarding. Both
  must keep working exactly as-is; these are the only two data-control actions that exist.
- Entry point into Review (§4.11) — must not link back to `onboarding.html` (that's the resumable-edit
  reconciliation from 2026-08-13; don't regress it).

### 4.11 Review — persona edit (`review.html` / `review.js`)
- List of all 10 questions with their current answer (or "Not answered," muted). Tapping one opens
  just that question, pre-selected to the current answer, saves independently. Editing one question
  must never touch the other nine.
- "Walk through all ten" is a shortcut into question 1 of this same per-question flow — not a
  re-trigger of the full onboarding sequence.

## 5. State machine reference (do not modify without a schema version bump)

**`state`** (lifecycle position — `schema/intent.json`, `intents.js`):
`captured → dormant → surfaced → {resolved | deferred → surfaced again | stalled | dropped}`;
repeated `stalled` cycles → `flagged_for_recovery` (feeds Recovery Mode only, aggregate not
per-intent). User-facing label via `stateLabel()`: only `surfaced`→"asked", `deferred`→"not yet",
`stalled`/`flagged_for_recovery`→"stuck", `resolved`→"done", `dropped`→"let go". Everything else
(`captured`, `dormant`) renders no tag.

**`resolution_status`** (final classification, independent axis):
`unresolved | done | done_late | done_adjacent | no_longer_relevant | abandoned`. Only `done`,
`done_adjacent`, `no_longer_relevant` are currently reachable from the UI (via `resolve()` in
`intents.js`). `done_late` and `abandoned` are schema-ready but have no UI path yet — that's
intentional (needs the timing/staleness logic that belongs to the reminder/inference layer, not the
render layer). Do not wire a UI button to them without that logic existing first.

**Framing modes** (`api/orchestrator.js` output, consumed by `framingCopy()`):
`direct | inquiring | activation-only | silent-recovery`, chosen per check-in from
`{moment, urgency, receptivity}` plus the persona. All four must always be reachable in production
(driven by inference or, on fallback, by `isAmbiguous()`'s rule-based "not sure" path) — never reduce
back to two.

## 6. What is genuinely unbuilt (prioritized — build in this order)

These are the gaps the codebase itself already documents as open, not new proposals. Confirm scope
with the user before starting any of these if the ask that sent you here didn't name it.

1. **Reminder/tone real-world validation** (`reminder/scheduler.js` intervals, the repair-vs-silent-
   recovery threshold, `STALL_THRESHOLD = 3`, the gap-baseline day mappings in `questions.js`) — all
   explicitly documented as untuned starting guesses. This needs real usage data, not more code, to
   move forward. Do not silently "improve" these numbers without flagging it — any change here is a
   product decision, not a bug fix.
2. **Capture access-point** (widget / lock-screen shortcut / wake-word) — named in the concept doc as
   possibly mattering more than any AI feature. Needs native-mobile work; a PWA cannot do this. Do not
   attempt inside `capture/web/`'s current web shell.
3. **On-device transcription** (`PRIVACY.md` §3's target state) — replace browser-native
   `SpeechRecognition` (which sends audio off-device in Chrome/Edge) with on-device Whisper (WASM).
   Typed fallback must never be removed, before or after this lands.
4. **Sensitivity/opt-out tiers** (`PRIVACY.md` §2) — designed on paper, not implemented. Needs a schema
   decision (new field on `intent.json` vs. a list on `persona.json`) before any UI work — don't build
   the UI first and back into a schema shape.
5. **`?dev=1` manual framing picker only offers 2 of 4 framings** — cosmetic gap in a dev-only tool,
   lowest priority of this list.

## 7. Explicit "do not touch" list

- Product vocabulary table in `frontend/README.md` — one canonical word per concept. If a new copy
  need doesn't fit an existing word, ask before inventing a new one; don't let synonyms creep back in.
- The per-parent rollup scope (§4.7) — the global-rollup alternative was tried and explicitly reverted.
- The three-pass, ten-question onboarding order and wording — already validated as "genuinely
  well-written" in a prior audit pass. Restructuring it needs a real reason, not a refactor impulse.
- `?dev=1`-gated build instruments (framing picker, decision-source readout) — keep them dev-only,
  keep them out of the default render path, but do not delete them; they're how tone/timing get
  tested.
- Task Detail's cosmetic gap vs. the mockup (§4.8) — closed, not a bug.
- The Organic design system tokens/components already in use across every screen
  (`_ds/organic-.../styles.css`) — this is the bound design system for the whole app; don't introduce
  new colors, fonts, or component patterns outside it.

## 8. Things to escalate to the user, not decide unilaterally

- Any move beyond single-user self-testing (accounts, sync, multi-device, pooled persona data) —
  explicitly out of scope until the product has more than one real tester.
- Any new network egress point beyond `/api/orchestrator` and `/api/decompose` — this is a privacy
  boundary decision, not a routine feature add.
- Tuning the untuned numbers in §6.1 — flag your reasoning, don't just change the constant.
- Reconciling Task Detail's visual gap with the mockup (§4.8) — currently deprioritized on purpose.
