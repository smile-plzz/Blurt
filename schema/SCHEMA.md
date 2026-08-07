# Schema

Source of truth for intent lifecycle and persona shape. Both schemas are versioned (`schemaVersion`) from day one — persona shape will change as inference logic matures, and migrations must not silently corrupt week-one self-test data.

## intent.json

One captured intent, full lifecycle.

| Field | Written by | Read by | Notes |
|---|---|---|---|
| `id`, `text`, `captured_at`, `capture_method` | Capture Agent | everyone | Raw event, no analysis performed at capture. |
| `category` | Persona Agent | Reminder Agent | Null until inferred. |
| `reminder_sent_at`, `follow_up_count` | Reminder Agent | Persona Agent (passive signal) | |
| `resolution_status`, `resolved_at` | Frontend (check-in UI) -> Orchestrator | Persona Agent, Reminder Agent | Enum, not boolean — see `resolution_status` enum for the done/done_late/done_adjacent/no_longer_relevant/abandoned split. |

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
