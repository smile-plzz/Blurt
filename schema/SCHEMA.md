# Schema

Source of truth for intent lifecycle and persona shape. Both schemas are versioned (`schemaVersion`) from day one — persona shape will change as inference logic matures, and migrations must not silently corrupt week-one self-test data.

## intent.json

One captured intent, full lifecycle.

| Field | Written by | Read by | Notes |
|---|---|---|---|
| `id`, `text`, `captured_at`, `capture_method` | Capture Agent | everyone | Raw event, no analysis performed at capture. |
| `category` | Persona Agent | Reminder Agent | Null until inferred. |
| `reminder_sent_at`, `follow_up_count` | Reminder Agent | Persona Agent (passive signal) | |
| `resolution_status`, `resolved_at` | Frontend (check-in UI) -> Orchestrator | Persona Agent, Reminder Agent | Enum, not boolean — see `resolution_status` enum for the done/done_late/done_adjacent/no_longer_relevant/abandoned split. Final-outcome taxonomy; distinct from `state` below. |
| `state`, `state_updated_at`, `stall_count` | Frontend/Orchestrator (state transitions) | Persona Agent (Recovery Mode trigger), Reminder Agent (framing-mode selection) | Lifecycle position (`captured -> dormant -> surfaced -> {resolved \| deferred \| stalled \| dropped}`, stalled repeats -> `flagged_for_recovery`). Added in 0.2.0 — see "Migrations" below. Not the same axis as `resolution_status`: `state` tracks *where the intent is right now*, `resolution_status` records its *final classification* once resolved. |
| `parent_intent_id`, `subtasks` | Frontend (decomposition approve/edit UI) -> Orchestrator | Frontend (grouping/rollup display), Reminder Agent (rollup check-in) | Added in 0.3.0. Subtasks are full intents, not a separate schema — `parent_intent_id` on a subtask, `subtasks` (array of ids) on its parent. Decomposition never runs at capture time and is never auto-committed; `subtasks` stays empty until the user approves an AI-proposed breakdown. Resolution is independent per intent in both directions — a subtask resolving does not resolve its parent, and vice versa. |
| `deadline`, `deadline_confirmed_absent` | Frontend (deadline-confirmation prompt) -> Orchestrator | Reminder Agent (ordering among items that have a deadline) | Added in 0.3.0. `deadline` is null by default, matching the no-deadline-by-default ethos — set only on explicit user confirmation. `deadline_confirmed_absent` prevents re-asking once the user has said no; an intent with neither set hasn't been asked yet. |

## persona.json

Per-user, isolated. Never pooled or generalized across users (design principle from `blurt-concept.md`).

| Field | Written by | Read by | Notes |
|---|---|---|---|
| `onboarding_profile` | Persona Agent (onboarding flow) | Persona Agent (seeds inference) | MC answers + voice transcript analysis. |
| `interaction_log` | Persona Agent (from intent events) | Persona Agent (inference input) | Append-only. |
| `inferred_patterns` | Persona Agent | Reminder Agent, Orchestrator | The layer that makes reminders feel calibrated instead of generic. Includes `confidence` so overfitting-to-one-user risk is visible. |
| `active_clarifications` | Persona Agent (periodic micro-questions) | Persona Agent | Active signal, fills gaps passive data can't explain. |

## Storage boundary

Local-first by default draft assumption (see `PRIVACY.md`), pending Privacy Agent's decision. Nothing in either schema is designed assuming cloud transmission; the Orchestrator Agent's LLM calls are the only planned egress point, and even that should be revisited against the Privacy Agent's opt-out/local-only requirements before wiring it.

## Versioning

- `schemaVersion` follows semver-ish (`major.minor.patch`) per file.
- Breaking changes (removed/renamed/retyped fields) bump major.
- Additive changes (new optional field) bump minor.
- Migrations for existing local data must be written before a schema change ships, not after.

### Migrations

**0.1.0 -> 0.2.0** (additive): added `state`, `state_updated_at`, `stall_count` per the Notion roadmap's minimal intent state machine (2026-08-10 design doc). Existing `blurt_intents_v0.1.0` localStorage records have no `state` field; on first read, any consumer must backfill `state: "dormant"` (not `"captured"` — these intents already survived capture) with `state_updated_at: null` and `stall_count: 0`, rather than treating the absence as an error. `resolution_status` is untouched — this migration does not reshape or reinterpret it.

**0.2.0 -> 0.3.0** (additive): added `parent_intent_id`, `subtasks`, `deadline`, `deadline_confirmed_absent` per the Notion roadmap's decomposition design decisions (2026-08-10 follow-up). Existing records have none of these fields; on first read, backfill `parent_intent_id: null`, `subtasks: []`, `deadline: null`, `deadline_confirmed_absent: false`. No existing field is reshaped or reinterpreted — an intent with no `parent_intent_id` and empty `subtasks` is just a normal, non-decomposed intent, which is every intent that predates this version.
