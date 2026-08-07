# Capture Agent

Access point + speech-to-text pipeline. Capture stays dumb and fast on purpose — no analysis here, only emits a raw `intent.json`-shaped event.

## Status

Not started. Prototype the access point (widget / lock-screen shortcut / wake-word / watch complication) before investing in transcription quality — per `AGENTS.md`, this is flagged as possibly mattering more than any AI feature.

## Open experiment

Which access-point mechanism gets prototyped first, and why. Write findings here once decided — this is explicitly not a settled choice.

## Fallback path

Silent/typed fallback required for the self-consciousness failure mode (speaking out loud in public). Must not be a second-class path.

## Depends on

`schema/intent.json` (draft is fine to start).
