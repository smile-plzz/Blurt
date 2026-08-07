# Persona & Inference Agent

Turns raw interaction logs into `inferred_patterns` (`schema/persona.json`).

## Status

Not started.

## Build order

1. Onboarding flow (MC questions + voice-recorded open answers -> `onboarding_profile`).
2. Passive signal collection wired to Capture Agent's event stream (or fake/manual data first).
3. Active signal collection (periodic micro-questions -> `active_clarifications`).
4. Pattern inference: start as LLM-based re-analysis of the log (per source doc recommendation for self-test phase), behind an interface that can later be swapped for rule/stat-based inference without changing what downstream agents consume.

## Overfitting instrumentation

Log confidence/coverage metrics (`inferred_patterns.confidence` in the schema) so single-user (mixed-subtype) overfitting risk stays visible, not silent.

## Isolation

Never pool or generalize a persona across users.

## Depends on

`schema/persona.json`; Capture Agent's event stream (fake/manual data acceptable before that exists).
