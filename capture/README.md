# Capture Agent

Access point + speech-to-text pipeline. Capture stays dumb and fast on purpose — no analysis here, only emits a raw `intent.json`-shaped event.

## Status

First prototype built: `web/` — a plain HTML/CSS/JS PWA, no build step, no framework.

## Access-point experiment

Chosen for this iteration: **installable PWA, one big tap target, home-screen icon**. Rationale — cheapest way to cut two of the source doc's three friction steps (no app-store install, no navigation once opened) while still self-testable today. This is *not* the final answer: it still requires unlocking the phone and finding the icon, so it does not solve the "remembering the app exists" step. True lock-screen/widget/wake-word access needs a native shell and is deferred — see `AGENTS.md`'s note that this stays an open experiment, not a settled choice.

## What it does

- Tap the mic button -> Web Speech API (`SpeechRecognition`) transcribes on-device/browser-native, no server round-trip.
- On result, immediately writes an `intent.json`-shaped object to `localStorage` (`blurt_intents_v0.1.0`) and shows a 1.4s non-blocking toast ("blurted."). No confirmation screen, no navigation.
- Typed fallback is always visible below the button, not hidden behind a menu — covers the self-consciousness-in-public failure mode named in `blurt-concept.md`.
- Service worker caches the shell so capture doesn't wait on network.
- Last 5 captured intents shown dimmed below, for self-trust only — this is not the check-in UI (that's Frontend Agent's job against `resolution_status`).

## Run it

Any static file server works, e.g. from `capture/web/`:

```
npx serve .
```

Open on a phone (same network) or `localhost` in a browser that supports `SpeechRecognition` (Chrome/Edge; Safari support is partial). Add to home screen to test the installed/standalone experience.

## Known gaps

- `SpeechRecognition` is not on-device for all browsers (Chrome sends audio to Google's servers for transcription) — flag for Privacy Agent review before this is treated as "local-first" in practice. `PRIVACY.md` needs an explicit call on this.
- No wake-word, no lock-screen widget, no watch complication yet.
- Intents are read directly from `localStorage` by nothing else yet — Persona/Reminder/Orchestrator agents don't consume this store yet. Wiring that up is next.

## Depends on

`schema/intent.json` (implemented against v0.1.0).
