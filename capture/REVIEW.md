# Blurt Capture Agent — Review & Spec

**Prepared by:** Capture Agent (AGENTS.md §2)
**Date:** 2026-08-12
**Source doc:** blurt-concept.md | AGENTS.md | schema/intent.json
**Scope:** Access point + voice-to-text pipeline + silent fallback. Review existing `capture/web/` PWA shell. Conformance to `intent.json` capture_method.

---

## 1. Existing PWA Shell Review

### What's there

- **`capture/web/index.html`** — Single-screen PWA. Centered mic button (120px tap target), live transcript status line, typed fallback input always visible below the button, dimmed recent-intents list, non-blocking toast confirmation. References `manifest.json`, `sw.js`, `app.js`, `style.css`, and an external "organic" design system stylesheet.
- **`capture/web/app.js`** — Two capture paths:
  1. **Voice:** `window.SpeechRecognition` / `webkitSpeechRecognition` (browser-native Web Speech API). Interim results feed a live transcript preview. On `end`, if `finalTranscript.trim()` is non-empty, calls `saveIntent(finalTranscript, "voice")`.
  2. **Typed fallback:** `type-form` submit handler calls `saveIntent(typeInput.value, "typed_fallback")`.
  - `saveIntent()` builds a full `intent.json`-shaped object (id, text, captured_at, capture_method, reminder_sent_at, follow_up_count, resolution_status, resolved_at, category, state, state_updated_at, stall_count) and writes to `localStorage` under `blurt_intents_v0.1.0`. Shows a 1.4s toast. No analysis performed.
  - Schema 0.1.0 → 0.2.0 migration backfills `state`, `state_updated_at`, `stall_count` on read.
  - `trackerStats()` exposed as `window.blurtTracker` for downstream agents.
- **`capture/web/sw.js`** — Minimal cache-first service worker. Caches `index.html`, `app.js`, `style.css`, `manifest.json`, `icon.svg`. `fetch` handler falls back to network. Capture works offline for the shell.
- **`capture/web/manifest.json`** — `display: "standalone"`, `orientation: "portrait"`, installable PWA with home-screen icon. `start_url: "./index.html"`.
- **`capture/web/style.css`** — Dark neutral-900 background (matches mockup screens 4-5). Pulse-ring animation on the mic button. Input styling. Toast and recent-list styling.

### What's missing

1. **No real access point beyond "home-screen icon."** The README explicitly acknowledges this: the PWA cuts two of three friction steps (no app-store install, no navigation once opened) but still requires unlocking the phone and finding the icon. The "remembering the app exists" step is not solved.

2. **SpeechRecognition is not Whisper-flow.** It's browser-native Web Speech API — Chrome sends audio to Google's servers for transcription; Safari support is partial. There is no on-device Whisper, no streaming transcription UX, no wake-word trigger, no background listening. The current implementation is a tap-mic-wait-for-result flow, not the "fires the instant an intention is spoken" pipeline the source doc describes.

3. **No widget/lock-screen/wake-word/watch complication.** These are all deferred per the README — exactly the access-point mechanisms the source doc flags as possibly mattering *more* than any AI feature.

4. **No downstream wiring.** Intents sit in `localStorage`. Persona/Reminder/Orchestrator agents don't consume this store yet. `trackerStats()` is exposed but nothing calls it.

5. **No `capture_method` enum completeness check against v0.3.0.** The existing code writes `"voice"` and `"typed_fallback"` — these match the v0.3.0 enum in `schema/intent.json`. No gap here. But the code still uses `SCHEMA_VERSION = "0.2.0"` while the schema is now at `0.3.0` (subtasks, parent_intent_id, deadline fields added). The capture layer doesn't need to write those fields (they're set by decomposition/persona later), but the version constant should be updated to avoid confusion.

### The gap: current PWA vs. zero-friction capture

| Friction step | Current PWA | Zero-friction target |
|---|---|---|
| Remember app exists | ❌ Home-screen icon only | Widget/lock-screen/wake-word |
| Unlock phone | ❌ Required | Lock-screen shortcut / always-on display |
| Open app | ❌ Tap icon → load PWA | Direct access point (widget tap, wake-word) |
| Navigate to capture UI | ✅ Already on capture screen | N/A — access point *is* the capture UI |
| Start recording | ✅ Tap mic | Voice trigger / already listening |
| Transcription | ⚠️ Browser-native, not Whisper, server-round-trip in Chrome | On-device Whisper, instant |
| Confirmation | ✅ 1.4s toast, no navigation | Same — done right |

The PWA is a good prototype for the *capture UI* but does not address the access-point layer at all. The source doc's concern is valid: for an ADHD user in the moment of intent, "remember app exists → unlock → find icon → tap mic" is still enough friction to lose the intention.

---

## 2. Access-Point Mechanism Spec

### Primary recommendation: Lock-screen / always-on widget (Android home-screen widget + iOS lock-screen widget)

**Why this one first:** It directly attacks the "remembering the app exists" friction step — the widget lives on the home screen or lock screen constantly, not buried in an app drawer. A tap on the widget opens the capture UI directly (or, ideally, triggers capture without fully opening the app). This is the most feasible near-term option across both major mobile platforms, and it's testable with a real device without requiring a full native shell.

**Tradeoffs assessed:**

| Mechanism | Friction reduction | Feasibility (near-term) | Privacy/social | Platform coverage |
|---|---|---|---|---|
| **Lock-screen/home widget** | ★★★★☆ — always visible, one tap | ★★★★☆ — standard platform feature, no special permissions beyond widget registration | Low risk — tap is silent, no speaking required | Android (home-screen widget), iOS 16+ (lock-screen widget), both covered |
| Wake-word ("hey Blurt") | ★★★★★ — zero tap, always listening | ★★☆☆☆ — requires native audio service, always-on mic, battery cost, OS background-audio restrictions | Higher — always-listening mic raises privacy questions; speaking out loud in public is the self-consciousness failure mode | Requires native shell on both platforms; harder on iOS (background audio limits) |
| Watch complication | ★★★★☆ — wrist-level access | ★★★☆☆ — requires watch app build, watch-specific UI | Low — silent tap on wrist | Apple Watch + Wear OS; narrower audience than phone widget |
| Lock-screen shortcut (Android) | ★★★☆☆ — one tap from locked state | ★★★★☆ — Android supports lock-screen shortcuts | Low | Android only |

**Decision:** Prototype the **home-screen/lock-screen widget** first. It's the cheapest way to remove the "remembering the app exists" step across both platforms, it's silent (no speaking in public), and it's a standard platform feature — no always-on mic, no wake-word infrastructure. The wake-word is the ideal end state but requires a native shell and always-on audio, which is a much bigger build. The widget is the right next step.

**What the widget does:** A persistent Blurt icon on the home screen / lock screen. Tap → capture UI opens directly to the mic-ready state (or, if voice is the default, begins listening immediately). The widget can also show a subtle count of recent uncaptured intents as a glanceable prompt. No navigation, no app-drawer search.

**What it doesn't do yet:** It doesn't eliminate the unlock step on iOS (lock-screen widgets are read-only glanceables on iOS until the phone is unlocked for interaction). Android home-screen widgets are interactive without unlocking if the device is already on. This is a platform limitation to call out explicitly.

---

## 3. Voice-to-Text Pipeline Spec (Whisper-flow style)

### Goal

The instant an intention is spoken, it's transcribed and emitted as a raw `intent.json` event — no intermediate navigation, no "press record," no server round-trip visible to the user.

### Current state

The existing code uses `SpeechRecognition` (Web Speech API). This is:
- **Not Whisper.** It's browser-native, and in Chrome the audio is sent to Google's servers for transcription.
- **Not instant.** The user must tap the mic button, then wait for the recognition to start, then speak, then wait for the `end` event.
- **Not always-on.** No background listening, no wake-word trigger.
- **Privacy flag:** Chrome sends audio off-device. The README calls this out for the Privacy Agent. `PRIVACY.md` needs an explicit call.

### Target pipeline

```
User speaks → audio captured → on-device Whisper (or streamed Whisper API as fallback) 
→ transcribed text → raw intent.json event emitted → downstream consumers notified
```

**Layer 1 — Audio capture:**
- If the access point is a widget tap: the widget opens the capture UI, which immediately enters listening state (no "press record" step — the tap *is* the trigger).
- If the access point is a wake-word (future): always-on mic listens for the trigger phrase; on trigger, capture begins automatically.
- The mic button in the current PWA is the fallback entry point for the installed-PWA case.

**Layer 2 — Transcription (Whisper-flow):**
- **Primary:** On-device Whisper (e.g., Whisper.cpp compiled to WebAssembly, or a native shell with Whisper embedded). This keeps audio on-device, matches the privacy-first posture, and eliminates the server round-trip.
- **Fallback:** If on-device Whisper isn't available (e.g., PWA in a browser without WASM Whisper), stream audio to a Whisper API endpoint (OpenAI Whisper, or a self-hosted instance). This is the "Whisper-flow" style — streaming transcription as audio arrives, not waiting for the full utterance.
- **Interim results:** As with the current `SpeechRecognition` interim-results approach, show a live transcript preview so the user sees what's being captured. But the *capture* (the `saveIntent` call) fires on the final result, not on interim chunks — same as the current code's behavior.

**Layer 3 — Emission:**
- On final transcript: build the `intent.json` object (id, text, captured_at, capture_method: "voice", state: "captured", all other fields at defaults/null), write to storage, emit a custom event (`blurt:intent-captured`) so downstream agents (Persona, Reminder, Orchestrator) can subscribe without polling `localStorage`.
- The toast confirmation is non-blocking and brief (1.4s currently — appropriate).

### What changes from the current code

1. Replace `SpeechRecognition` with a Whisper inference path (on-device WASM first, API fallback second).
2. Add a `blurt:intent-captured` custom event dispatch after `saveIntent()` so downstream agents don't need to poll.
3. Update `SCHEMA_VERSION` to `"0.3.0"` (capture layer doesn't write the new fields, but the constant should reflect the schema it's conforming to).
4. The access point (widget) changes *how* the capture UI is reached, not *what* happens once it's open — the transcription and emission logic is the same regardless of entry point.

---

## 4. Silent / Typed Fallback Path

### The failure mode

The source doc raises: does speaking out loud in public defeat the purpose for some users? If a user is in a meeting, on public transit, or around people they don't want to hear them muttering "I should cut my nails," voice capture is a non-starter. A hard voice-only path blocks those moments.

### Design: near-zero-friction typed fallback that's always available, not hidden

**Current state:** The typed input is already visible below the mic button in the PWA. Good — it's not hidden behind a menu. But it's still a form field with a submit button, which is more friction than ideal.

**Target:** The typed fallback should be as close to "tap, type a few words, done" as possible — no cursor focus hunting, no keyboard navigation, no form validation. Specifically:

1. **Always-visible input**, no hiding. The current PWA already does this. Keep it.
2. **"Tap anywhere to capture" for typed:** On a locked/widget-opened screen, the entire capture area should accept a tap that focuses the input and brings up the keyboard — no need to precisely tap the input field. The current code has `captureMain.addEventListener("click", ...)` for stopping voice; extend this so a tap when *not* listening focuses the typed input.
3. **Submit on Enter or on blur:** The current form submit handler handles Enter. Add blur-based submit so if the user types and taps away (e.g., to dismiss the keyboard), the intent is captured anyway — no explicit submit tap needed.
4. **No confirmation screen:** The toast is sufficient. The current code does this right.
5. **`capture_method: "typed_fallback"`** is already set correctly in `saveIntent()`. No change needed.

### Why this isn't "open app, navigate to form, type carefully"

Because the access point (widget) puts the capture UI — with the typed input already visible — directly on screen with one tap. No app-drawer search, no navigation to a different screen, no form to find. The typed input is the second thing the user sees, not the tenth.

---

## 5. intent.json Conformance Check

### capture_method field

`schema/intent.json` v0.3.0 defines:
```json
"capture_method": { "type": "string", "enum": ["voice", "typed_fallback"] }
```

The existing `app.js` writes:
- `"voice"` — from the `SpeechRecognition` result handler (`saveIntent(finalTranscript, "voice")`)
- `"typed_fallback"` — from the typed form submit handler (`saveIntent(typeInput.value, "typed_fallback")`)

**Conformance: ✅ passing.** Both values are in the enum. No other values are written. No analysis is performed at capture time (the `text` field is the raw transcript, unedited).

### Other required fields

`intent.json` v0.3.0 required fields: `id`, `text`, `captured_at`, `resolution_status`, `state`.

The existing `saveIntent()` writes all five:
- `id`: `crypto.randomUUID()` ✅
- `text`: `trimmed` (raw, unedited) ✅
- `captured_at`: `new Date().toISOString()` ✅
- `resolution_status`: `"unresolved"` (default) ✅
- `state`: `"captured"` (default) ✅

**Conformance: ✅ passing.**

### Schema version mismatch (non-blocking)

The code declares `SCHEMA_VERSION = "0.2.0"` but the schema is at `0.3.0`. The capture layer doesn't write `parent_intent_id`, `subtasks`, `deadline`, or `deadline_confirmed_absent` — those are set by decomposition and persona agents later. So the capture output is still valid against v0.3.0. But the constant should be updated to `"0.3.0"` to avoid confusion for downstream consumers reading the tracker stats.

### No analysis at capture layer

The current code does not categorize, prioritize, or interpret the intent text. It writes the raw transcript. This matches the "capture stays dumb" principle. ✅

---

## 6. Summary of Changes Needed (no file modifications — assessment only)

| Item | Current state | Needed | Priority |
|---|---|---|---|
| Access point | PWA home-screen icon only | Lock-screen/home widget (primary) + wake-word experiment (future) | High — source doc flags this as possibly more important than AI |
| Transcription | `SpeechRecognition` (browser-native, server-round-trip in Chrome) | On-device Whisper (WASM) with Whisper API fallback; streaming interim results | High — current path has privacy flag and isn't "instant" |
| Entry trigger | Tap mic button | Widget tap → immediate listen; wake-word trigger (future) | High — tied to access point |
| Downstream event | ✅ done (2026-08-13) — `blurt:intent-captured` dispatched from `saveIntent()` after the localStorage write, carrying the stored intent object | — | Medium — enables Persona/Reminder/Orchestrator to subscribe without polling |
| Schema version constant | ✅ done (2026-08-13) — `SCHEMA_VERSION` now `"0.3.0"` | — | Low — non-blocking, capture output already valid |
| Typed fallback | Visible input + form submit | Add tap-anywhere-to-focus + blur-submit for near-zero friction | Medium — improves the silent fallback path |
| Privacy review | `SpeechRecognition` sends audio to Google in Chrome | `PRIVACY.md` needs explicit call on browser-native STT vs. on-device Whisper | High — flagged in README, blocks "local-first" claim |

---

## 7. Open Questions for the Team

1. **Widget platform priority:** Android first (interactive home-screen widgets without unlock)? Or iOS first (lock-screen glanceable widget, with interaction requiring unlock)?
2. **Whisper deployment:** WASM-on-device (privacy-first, no network) or cloud Whisper API (simpler, needs network)? The privacy-first posture suggests on-device, but on-device Whisper in a PWA via WASM has performance/footprint tradeoffs worth testing.
3. **Wake-word scope:** Is the wake-word a v1 goal or a later experiment? It requires a native shell and always-on audio, which is a significant build. The widget is the right first access point; wake-word may be v2.
4. **Custom event schema:** What does the `blurt:intent-captured` event payload look like? Just the intent JSON, or a subset? Needs agreement with Persona/Reminder agents on what they subscribe to.

---

*End of review.*
