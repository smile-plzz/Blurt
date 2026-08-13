# Orchestrator / System-Prompt Agent

Glue layer, built last. Wires the LLM calls that turn a captured intent + persona into a structured reminder plan.

## Status

MVP built (2026-08-13). Design in `REVIEW.md`, code in `api/orchestrator.js`. The dependency this
file's old "blocked by design" note referred to is satisfied: Capture and Frontend have live
prototypes, Persona has a schema + onboarding flow, and `api/infer.js` already proved the
single-call version works end-to-end. Reminder Agent is still unbuilt — `schedule_hint` is
produced as an advisory signal for it per `REVIEW.md` §6 item 3, not yet consumed by anything.

`frontend/web/app.js`'s `inferDecision()` now calls `/api/orchestrator` instead of `/api/infer`.
`api/infer.js` is left in place as a fallback/prior endpoint during the transition, not deleted.

## Design constraint

Persona-read and reminder-plan-write are separate, explicit steps, not one opaque call, so the Persona Agent's inference logic stays swappable without touching this layer. Implemented as two sequential prompts inside one Vercel endpoint (`api/orchestrator.js`) so the frontend still pays for only one network round trip per check-in (`REVIEW.md` §5, "Option 2").

Step A (persona read) is skipped as an LLM call while `inferred_patterns` is still empty (no Persona Agent inference pass writes it yet) — the summary is built deterministically from `onboarding_profile` alone. It becomes a real LLM call once there's actual inferred-pattern data to synthesize.

## Pipeline

capture -> persona read (Step A) -> reminder plan (Step B, JSON) -> frontend render

## Depends on

All other build agents having at least a stubbed interface. Satisfied as of this build — see `REVIEW.md` §1.
