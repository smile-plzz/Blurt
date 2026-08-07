# Privacy & Data-Handling

Owned by the Privacy Agent. Runs continuously, not a late-stage checklist.

## Storage boundary decision (draft)

**Local-first, by default.** Voice recordings and behavioral/failure logs are sensitive, health-adjacent data. Draft assumption per `blurt-concept.md`'s early flag: keep everything on-device unless/until there's a specific, reviewed reason to transmit.

**Rationale:** self-testing on one person (Ismail) doesn't need cloud sync. Retrofitting local-only storage after a cloud-first build is the painful path the source doc explicitly warns about — deciding now avoids that.

**Revisit trigger:** if this ever moves beyond self-testing to other testers (per the mixed-subtype overfitting concern in `OPEN_QUESTIONS.md`), or if the Orchestrator Agent's LLM calls require sending persona/intent data to a hosted model. That egress point (if any) is the only planned exception and must be reviewed here before it ships, not after.

## Opt-out / local-only categories

Open question, not yet resolved: users may not want certain intent categories (embarrassing, private, medical) captured or analyzed at all. The Data & Schema Agent's `category` field on `intent.json` should support an exclusion list once this is designed. Not yet implemented.

## Review responsibility

Every other agent's outputs get reviewed here for data-collection scope creep — especially the Persona Agent's passive+active signal loop, which is powerful and can easily overreach beyond what's needed for `inferred_patterns`.

## Status

Draft only. Not yet reviewed against any agent's actual implementation (none exist yet).
