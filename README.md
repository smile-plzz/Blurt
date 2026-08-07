# Blurt — "just blurt it out"

Voice-first intent-capture companion for ADHD users. Not a todo app: captures a fleeting intention the moment it forms, then uses a per-user persona to decide when/how to gently resurface it.

Read `blurt-concept.md` first (product rationale, data model sketch, open design questions), then `AGENTS.md` (who builds what, build order).

## Structure

| Path | Owner | Purpose |
|---|---|---|
| `schema/` | Data & Schema Agent | `intent.json`, `persona.json`, `SCHEMA.md` |
| `capture/` | Capture Agent | Access point + voice-to-text pipeline |
| `persona/` | Persona & Inference Agent | Onboarding, passive/active signal, pattern inference |
| `reminder/` | Reminder & Tone Agent | Scheduling, check-in flow, tone-tested copy |
| `frontend/` | Frontend / Render Agent | Renders capture/check-in/reminder surfaces off the JSON contracts |
| `orchestrator/` | Orchestrator Agent | System prompts, capture -> persona -> reminder plan -> render pipeline (built last) |
| `PRIVACY.md` | Privacy Agent | Storage boundary decision, opt-out categories |
| `OPEN_QUESTIONS.md` | QA Agent | Living checklist of unanswered validation questions |

## Build order

1. Data & Schema Agent (everyone depends on its contracts).
2. Capture Agent + Reminder/Tone Agent in parallel, against fake data.
3. Persona Agent once schema is stable and fake interaction data exists.
4. Frontend Agent against stub JSON.
5. Orchestrator Agent last, once each piece works standalone.
6. Privacy Agent and QA Agent run continuously throughout.
