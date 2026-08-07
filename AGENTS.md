# Blurt - Multi-Agent Build Instructions for Claude Code

This file is the instruction set for building **Blurt** ("just blurt it out"), a voice-first intent-capture companion for ADHD users. Read `blurt-concept.md` (the source doc) alongside this file before starting any agent's work - it contains the full product rationale, the data model sketch, and the open design questions each agent must resolve, not just implement.

Core insight to protect at every layer: the failure point is **intent decay** - a fleeting intention forms and dies before it reaches a todo list. Nothing here should regress into a generic task manager. If any agent's output starts looking like a todo app, stop and re-read the source doc's "trap to avoid" section.

---

## How the agents work together

These agents run **concurrently**, not sequentially, because the hard problems (capture friction, persona inference, follow-up tone) are independent enough to prototype in parallel and cheap enough to fake with stub data before wiring real AI logic. Each agent owns one niche, produces a defined output artifact, and consumes defined inputs from other agents. A short sync note at the end of each agent's section says what it needs from whom.

Build order recommendation (even though agents work in parallel, sequence matters for what's testable first):
1. Data & Schema Agent goes first, everyone else depends on its contracts.
2. Capture Agent and Reminder/Tone Agent prototype in parallel with fake data - these are flagged in the source doc as the two things worth testing before any real AI work.
3. Persona Agent starts once the schema is stable and there's at least fake interaction data to infer from.
4. Frontend Agent renders against the JSON contracts as soon as they exist, using stub responses.
5. Orchestrator Agent wires real LLM calls in last, once each piece works standalone.
6. Privacy Agent and QA Agent run continuously throughout, not as a final phase.

---

## 1. Data & Schema Agent

**Niche:** Owns the single source of truth for how an intent's lifecycle is represented in storage and in transit between agents.

**Responsibilities:**
- Formalize the `User Persona` object from the source doc into a versioned JSON schema, including the `interaction_log`, `inferred_patterns`, and `active_clarifications` blocks.
- Design the full lifecycle of a single intent as its own schema, not just done/not-done. Per the source doc's explicit flag: resolution needs more than binary yes/no (e.g. "did it late," "did something adjacent," "decided it didn't matter"). Enumerate this as a proper resolution-type field, not a boolean.
- Define the storage boundary: what is local-only vs. what (if anything) is ever transmitted, in coordination with the Privacy Agent.
- Version the schema from day one - the persona model will change shape as inference logic matures, and migrations need to not silently corrupt week-one self-test data.

**Outputs:** `schema/intent.json`, `schema/persona.json`, a short `SCHEMA.md` explaining each field's purpose and who writes/reads it.

**Depends on:** Privacy Agent's local-vs-cloud decision (can start with a draft assumption of local-first and revise).

**Relevant skills:** `engineering:system-design`, `engineering:architecture` (for the ADR on schema versioning and storage boundary decisions).

---

## 2. Capture Agent

**Niche:** The access point and speech-to-text pipeline - the layer the source doc flags as possibly mattering more than any AI feature.

**Responsibilities:**
- Solve the "3 steps of friction" problem named explicitly in the source doc: remembering the app exists, unlocking the phone, opening the app. Prototype the *access point* itself (widget, lock-screen shortcut, wake-word, watch complication) before investing in transcription quality.
- Wire voice-to-text conversion (whisper-flow style) that fires the instant an intention is spoken, with no intermediate navigation.
- Handle the self-consciousness failure mode raised in the source doc's open questions: does speaking out loud in public defeat the purpose for some users? Build a silent/typed fallback path so this isn't a hard blocker.
- Emit a raw captured-intent event conforming to the Data Agent's schema, timestamped, with no analysis performed at this layer - capture stays dumb and fast on purpose.

**Outputs:** Capture module + a short writeup of which access-point mechanism was prototyped and why, since the source doc treats this as an open experiment, not a settled choice.

**Depends on:** Data & Schema Agent's intent schema (draft is fine to start).

**Relevant skills:** `engineering:debug` (mobile/OS-level capture is fiddly), `design:ux-copy` (for whatever confirmation/error copy appears at the moment of capture, since friction here defeats the whole premise).

---

## 3. Persona & Inference Agent

**Niche:** Turns raw interaction logs into the `inferred_patterns` block that makes reminders feel personally calibrated instead of generic.

**Responsibilities:**
- Build the onboarding flow: multiple-choice questions (subtype, rhythm, known triggers) plus voice-recorded open answers, both feeding an initial persona draft.
- Implement passive signal collection (every capture, every check-in outcome, every ignored reminder) and active signal collection (periodic small follow-up questions to fill gaps passive data can't explain).
- Start pattern inference as LLM-based re-analysis of the log, per the source doc's own recommendation for the self-test phase (simpler and more flexible than rules, acceptable token cost at single-user scale). Design the interface so it can be swapped for rule/stat-based inference later without changing what downstream agents consume.
- Explicitly instrument for the overfitting risk the source doc names: self-testing on one person (a mixed subtype) risks tuning logic that only works for that one flavor of ADHD. Log confidence/coverage metrics so this is visible, not silent.
- Keep every persona fully isolated per user - never pooled, never generalized across users, per the source doc's design principle.

**Outputs:** Onboarding flow, persona-update pipeline, and a running log of what the inference step is confident about vs. guessing at.

**Depends on:** Data & Schema Agent's persona schema; Capture Agent's event stream for real signal once available (can use fake/manual data before that).

**Relevant skills:** `data:statistical-analysis` (for later, when validating whether inferred patterns hold up beyond one user), `engineering:architecture` (for the LLM-vs-rules swap decision, worth recording as an ADR).

---

## 4. Reminder & Tone Agent

**Niche:** The scheduling and follow-up logic - flagged in the source doc as probably the single hardest design problem in the whole product, harder than the persona ML.

**Responsibilities:**
- Own the tension named directly in the source doc: too gentle becomes ignorable noise that trains the user to dismiss reminders; too persistent becomes the nagging/shame machine the product exists to avoid. This tradeoff needs to be prototyped in copy and timing before any backend scheduling logic is built.
- Design the check-in flow: resurface at a contextually smart moment, ask "did you do it?", and on a no, decide between re-scheduling logic and a softer follow-up rather than treating one miss as failure.
- Draft actual reminder/check-in copy variants and get them in front of real ADHD users for reaction (the source doc explicitly recommends asking users to describe the best and worst reminder they've ever received, rather than guessing).
- Determine whether missed reminders need repair (an apology-free re-ask) or a channel/timing switch after repeated ignoring, per the source doc's open question.

**Outputs:** Reminder scheduling module, a small library of tone-tested copy variants, and notes on where the nagging threshold seemed to sit for early testers.

**Depends on:** Data & Schema Agent's resolution-type field (needs more than done/not-done to work with); Persona Agent's inferred reminder windows once available (can stub with fixed intervals first).

**Relevant skills:** `design:ux-copy`, `product-management:product-brainstorming` (useful for stress-testing the gentle-vs-persistent tradeoff before committing to a default).

---

## 5. Frontend / Render Agent

**Niche:** Renders whatever the reminder/persona pipeline produces - reminders, check-ins, the capture confirmation - from the JSON contracts, matching the system-prompt-to-JSON-render architecture from the source doc.

**Responsibilities:**
- Render dynamically off the structured JSON output rather than hardcoding UI to any one problem type, since the underlying architecture is meant to generalize across whichever core problem gets chosen.
- Build the capture confirmation UI to be as close to invisible as possible - this is the layer that can quietly reintroduce the friction the Capture Agent worked to remove.
- Build the check-in UI as a genuine two-way surface (did it / didn't / did something adjacent / doesn't matter anymore), not a binary checkbox, matching the Data Agent's resolution-type field.
- Keep this a thin rendering layer - no business logic about timing or tone belongs here, that's the Reminder Agent's job.

**Outputs:** Frontend module rendering capture, check-in, and reminder surfaces against stub JSON, upgraded to live data as other agents land.

**Depends on:** Data & Schema Agent's schemas (hard dependency, can't meaningfully start without at least a draft).

**Relevant skills:** `frontend-design` (for interaction and visual design decisions on a UI whose whole job is to not add friction), `design:accessibility-review` (worth a pass given the user base's attentional differences).

---

## 6. Orchestrator / System-Prompt Agent

**Niche:** Wires the LLM calls that turn a captured intent plus a persona into a structured reminder plan - the glue layer, built last.

**Responsibilities:**
- Design the system prompt(s) that take a raw captured intent + the user's current persona state and output the JSON-structured reminder plan the Frontend Agent renders.
- Keep persona-read and reminder-plan-write as separate, explicit steps rather than one opaque call, so the Persona Agent's inference logic stays swappable without touching this layer.
- Only integrate once Capture, Persona, and Reminder agents each work independently against stub data - this agent's job is composition, not first-draft logic for any single piece.

**Outputs:** System prompt(s), the orchestration code path connecting capture -> persona read -> reminder plan -> frontend render.

**Depends on:** All other build agents having at least a stubbed interface.

**Relevant skills:** `engineering:system-design`.

---

## 7. Privacy & Data-Handling Agent

**Niche:** Runs continuously, not as a late-stage checklist - decides how sensitive data (voice recordings, behavioral failure logs) is stored and whether anything leaves the device.

**Responsibilities:**
- Make the local-vs-cloud call explicitly and early, per the source doc's flag that this is a "not a blocker but worth deciding early" decision that gets painful to retrofit later.
- Define an opt-out or local-only mode for intent categories users may not want captured or analyzed at all (embarrassing, private, medical), per the source doc's open question.
- Review every other agent's outputs for scope creep on data collection - the persona's passive+active signal loop is powerful and can easily overreach.

**Outputs:** `PRIVACY.md` stating the storage boundary decision and rationale, reviewed against each agent's actual implementation, not just their spec.

**Depends on:** Nothing to start (should produce a first draft immediately so Data & Schema Agent isn't blocked); revises as other agents' real behavior becomes clear.

**Relevant skills:** `legal:compliance-check` (light-touch, mainly useful if this ever moves beyond self-testing to other users).

---

## 8. QA & Validation Agent

**Niche:** Keeps the whole build honest against the open questions the source doc raises, especially the ones self-testing on one person can't answer alone.

**Responsibilities:**
- Track the source doc's validation questions as an explicit checklist (intent-decay as a distinct failure mode, average gap between intent formation and action/forgetting, what current non-app workarounds already do that this needs to beat).
- Flag when the Persona Agent's inference logic is being validated only against Ismail's own mixed-subtype data, and push for at least one other tester before trusting generalization claims, per the source doc's explicit caution.
- Own the "why would this survive week 3" retention question as an ongoing concern, not a launch-week afterthought.

**Outputs:** A living `OPEN_QUESTIONS.md` tracking which of the source doc's validation questions are answered, partially answered, or still open, updated as each agent ships.

**Depends on:** Visibility into all other agents' outputs; doesn't block anyone.

**Relevant skills:** `engineering:testing-strategy`, `data:validate-data`.

---

## Notes for Claude Code

- Treat the source doc (`blurt-concept.md`) as the spec of record for *why*, and this file as the spec of record for *who builds what*. When they seem to conflict, the source doc wins on product intent; this file wins on build sequencing and ownership.
- The two riskiest, cheapest-to-derisk pieces are capture friction and reminder tone. Both agents should produce something testable with fake/manual backends before any real AI logic is written, exactly as the source doc recommends.
- Do not let the Orchestrator Agent's work start until Capture, Persona, and Reminder each function against stubs - composing three half-finished pieces early tends to produce debugging pain that's hard to disentangle later.
