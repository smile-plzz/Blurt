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

Draft only.

**Flag from Capture Agent's first prototype (`capture/web/`):** it uses the browser `SpeechRecognition` API. On Chrome/Edge this sends raw audio to the vendor's server for transcription — that's a real exception to "local-first" already present in week one, not a hypothetical. Options to resolve: (a) accept it for the self-test phase and document it here as a known, scoped exception, (b) swap to an on-device model (e.g. `whisper.cpp`/`transformers.js`) before continuing self-testing. Not yet decided — needs a decision before this stops being a draft.
