# Blurt - "just blurt it out"

### Product: A single-problem ADHD companion (not a task manager) "Intent Capture" — a voice-first intention logger with persona-aware follow-up

**The trap to avoid:** Most "ADHD apps" collapse into generic todo/reminder apps with rigid task structures. That's exactly what makes them fail for ADHD users. Task organizers assume someone can already break down, prioritize, and stick to a plan. ADHD is precisely the condition where that machinery is unreliable, so a rigid list becomes just another source of shame when it's abandoned after day three.

**The approach:** Pick ONE specific struggle (not "ADHD" broadly, since that's actually thousands of different problems depending on inattentive vs. hyperactive vs. combined type) and solve it deeply, rather than building a shallow multi-feature app.

**Candidate core problems to choose from** (pick one):

- **Task initiation paralysis** – knowing what to do but being unable to start (executive dysfunction on the "go" step)
- **Time blindness** – losing track of how much time has passed or is left, chronically misjudging duration
- **Object/context permanence** – "out of sight, out of mind" losing track of physical items, open loops, or commitments
- **Working memory drops mid-task** – forgetting what you were doing seconds after switching context
- **Hyperfocus transition failure** – unable to disengage from one task to start/stop for something important (meals, meetings, sleep)
- **Emotional dysregulation from small failures** – rejection sensitivity spiraling after missing one task derails the whole day

**Suggested first move:** Since you mentioned you're a mix (2 of the 3 types) and want to test on yourself first — spend a week just logging *when* you personally get stuck, without trying to fix anything. Not "I have ADHD, help me organize" but literally: what's the moment-to-moment failure point? That log becomes your one problem statement.

**Technical shape (from the earlier part of the thread):** system-prompt-driven task decomposition, JSON structured output, rendered dynamically on the frontend — this architecture is well-suited to *any* of the above, since the LLM's job would be interpreting messy human intent into whatever narrow structure the one chosen problem needs (not a generic task tree).

**The core insight from your example:** The failure point isn't planning or task management — it's that a fleeting intention ("I should cut my nails") gets formed, then silently dies the moment attention shifts elsewhere. There's no todo app failure here; the person never even got to the todo stage. The moment of intent itself needs to be captured before it evaporates.

#### How it works

1. **Capture (near-zero friction):** User speaks the moment an intention forms — "I should cut my nails" — no typing, no app navigation, no forms. Voice-to-text (whisper flow style) converts it instantly.
2. **Persona-based analysis:** The AI has a standing model of the user (their ADHD subtype, patterns, what they tend to forget, their daily rhythm) and uses that persona plus the captured intent to decide *how* and *when* to resurface it — not just a generic timer.
3. **Smart resurfacing:** Instead of a rigid due date, the AI reminds at a contextually smart moment, checks in ("did you do it?"), and if not, follows up again later rather than treating one missed nudge as failure.
4. **Non-punishing loop:** The follow-up is designed to not pressure or shame — closer to a gentle "still there?" than a red overdue badge.

#### Why this is different from a todo app

- User never has to *decide* to log a task or open an app with intent to organize — capture happens in the moment of thought, which is the exact moment ADHD intentions are most fragile.
- The system does the categorizing and prioritizing (which is the executive function step that's unreliable), not the user.
- It's built around *one* mechanism — capture → persona-aware reminder → gentle follow-up — rather than trying to be a full life-management suite.

#### Two-phase build path (matches what you and Tanvir discussed)

- **Phase 1 (data collection on yourself):** Before building the AI layer, just log your own intentions as they happen for a couple weeks — this becomes your training ground for understanding your own patterns and validates the core loop manually.
- **Phase 2 (product):** Speech-to-text capture → LLM persona + task analysis → JSON-structured reminder plan → frontend renders reminders/check-ins, using the same system-prompt/JSON-render architecture from earlier in your thread.

#### Open design questions worth prototyping around

- How does the persona get built — onboarding questionnaire, or inferred over time from captured intents?
- What's the check-in cadence that feels supportive rather than nagging?
- Does "no" to a check-in trigger re-scheduling logic, or just a softer follow-up?

### Persona System Design

#### 1. Onboarding (cold start)

- Mix of multiple-choice questions (fast, structured signal — ADHD subtype, daily rhythm, known trigger patterns) and voice-recorded open answers (captures nuance, tone, how they actually talk about their own struggles)
- Voice answers get transcribed and analyzed alongside the MC answers to draft an initial persona — not just tags like "inattentive type" but something closer to a working model: what this specific person forgets, when, and under what conditions

#### 2. Persona as living knowledge base (per-user, isolated)

- Each user's persona is its own private knowledge base — never shared or generalized across users, since ADHD manifests too differently person to person for a pooled model to be useful here
- The persona isn't static after onboarding. It's the thing the whole app is built around, so it needs to keep updating

#### 3. Growth loop (how the persona improves over time)

- **Passive signal:** every captured intent, every check-in response (did it / didn't do it / did it late), every ignored reminder feeds back into the persona
- **Active signal:** the app periodically asks small follow-up questions — not a big survey, just situational micro-questions ("you tend to forget things after switching tasks — is that usually when you're on your phone, or something else?") to fill gaps the passive data can't explain
- Over time the persona should get sharp enough that reminders feel personally calibrated rather than generic

#### Rough data model to consider

```
User Persona {
  onboarding_profile: { adhd_subtype, mc_answers, voice_transcript_analysis }
  interaction_log: [ {intent, captured_at, reminder_sent_at, resolved: bool, resolved_at, follow_up_count} ]
  inferred_patterns: { forget_triggers, best_reminder_windows, task_categories_prone_to_drop }
  active_clarifications: [ {question, answer, timestamp} ]  // from periodic micro-questions
}
```

The `inferred_patterns` block is probably the part actually worth prototyping first — it's the layer that turns raw logs into something the reminder engine can act on. Everything else (capture, TTS, reminder scheduling) is comparatively standard to build; this is the part that makes it a "persona" instead of a database.

**One thing worth deciding early:** does pattern inference happen via LLM re-analysis of the log periodically (simpler, more flexible, costs tokens), or do you want lightweight rule/stat-based inference first (cheaper, faster, less "smart")? Given you're planning to self-test first, LLM-based inference is probably fine to start — you can always harden it into rules later once you know which patterns actually matter.

### Product Summary: ADHD Intent-Capture Companion

**Core problem:** Not task management — task *initiation and memory loss*. ADHD users form real intentions ("I should cut my nails") that vanish the moment attention shifts, before they ever reach a todo list. Generic task/todo apps fail because they assume the user can already plan, prioritize, and stick to structure — the exact executive functions that are unreliable.

**Core idea:** A voice-first app that captures fleeting intentions the instant they occur, then uses a per-user AI persona to decide when and how to resurface them — with gentle, non-shaming follow-up instead of rigid due dates.

**How it works:**

1. **Capture** — user speaks an intention the moment it forms; speech-to-text logs it instantly (near-zero friction)
2. **Persona-aware analysis** — AI reads the intent through the lens of that user's own persona (their patterns, triggers, subtype) to decide timing and framing of a reminder
3. **Check-in & follow-up** — reminds at a smart moment, asks "did you do it?", and follows up again later if not, without pressure or shame
4. **Persona grows over time** — every interaction (captured intent, resolved/ignored reminder) feeds back into the user's private persona; periodic micro-questions fill gaps passive data can't explain

**Key design principles:**

- One narrow problem solved deeply, not a general-purpose organizer
- Each user's persona is private and self-contained — never pooled or generalized across users
- The system does the categorizing/prioritizing (the broken step), not the user
- Self-test on yourself first (data collection phase) before building the full product

**Build path:** onboarding (MC questions + voice) → initial persona → capture loop (voice → TTS → LLM task/persona analysis → JSON reminder plan → frontend render) → passive + active persona refinement over time.

**Open questions still to resolve:** exact onboarding question set, JSON schema for an intent's full lifecycle, and whether pattern inference starts as LLM-based (flexible, costs tokens) or rule-based (cheaper, less smart) — probably LLM-based to start, given the self-testing phase.

**What's genuinely strong here:**

- The nail-cutter example is a real insight, not a generic ADHD trope. Most "ADHD apps" target the planning stage; you're targeting the pre-planning moment where intent forms and dies. That's underserved and specific.
- Refusing to generalize into a todo app despite the pull to do so (twice in this thread) is the right call. That discipline is rare and it's usually what kills these products when abandoned.

**Things I'd flag:**

1. **Voice capture has an activation-energy problem too.** The whole premise is "intentions die because friction kills them before you act." But opening an app and speaking still requires (a) remembering the app exists in that moment, (b) unlocking phone, (c) opening app. For someone with the exact deficit you're solving for, that's still 3 steps of friction. Widget/lock-screen/watch-complication level access, or a wake-word, might matter more than any AI feature. Worth prototyping the *access point* as hard as the AI.
2. **The "gentle follow-up, no pressure" design goal is easy to state and hard to actually build.** There's a real tension: too gentle and it's ignorable noise (which trains the user to dismiss it, defeating the purpose); too persistent and it becomes the nagging/shame machine you're explicitly trying to avoid. This is probably the single hardest design problem in the whole product, harder than the persona ML — worth prototyping the notification/copy tone before the backend architecture.
3. **Self-testing on one person (you) has a real limitation.** You mentioned you're a mix of 2 subtypes. Whatever pattern-inference logic you tune against your own data risks overfitting to your specific flavor of ADHD. That's fine for a prototype/validation phase, but flag it explicitly to yourself so you don't mistake "works for me" for "works generally" — you'll need at least a couple other testers with different subtypes before trusting the persona logic generalizes at all.
4. **Privacy/sensitivity note, not a blocker but worth deciding early:** voice recordings + a detailed behavioral/failure log is sensitive health-adjacent data. Even at prototype stage, deciding now whether this stays fully local/on-device vs. cloud-processed will save you a painful re-architecture later if you ever want to share it beyond yourself and Tanvir.
5. **One thing I'd add to the concept, not just flag:** consider whether "resolved" needs more than a binary yes/no. "Did it late but did it," "did something adjacent instead," "decided it didn't matter anymore" are all different signals for the persona to learn from — collapsing them to done/not-done will make your `inferred_patterns` blunter than it needs to be.

Overall: the idea is coherent and the scope discipline is good. The two things I'd actually spend prototype time on first, before any AI/persona work, are the **capture friction** and the **follow-up tone** — those are the UX bones the whole thing lives or dies on, and they're both cheap to test with a fake/manual backend before writing any real AI logic.

### On the core problem (validate the insight itself)

1. Is "intent decay" (forming an intention, then losing it before action) actually a distinct, common failure mode across ADHD subtypes — or is it mostly an inattentive-type pattern, meaning combined/hyperactive users might need something different?
2. How long is the actual gap, on average, between intent formation and either (a) acting on it or (b) forgetting it? Minutes? Hours? This determines how urgent capture needs to be.
3. When intents *do* get "saved" successfully today (without any app), what's actually working? Sticky notes, phone reminders, telling someone out loud? Understanding existing workarounds tells you what to beat.
4. Do non-ADHD people also experience this (like Tanvir noted) — and if so, does that make it a bigger market, or does it mean the ADHD-specific angle isn't actually the differentiator you think it is?

### On the capture mechanism

1. In the actual moment an intention forms, is voice really the lowest-friction option — or does self-consciousness (speaking out loud in public, in front of others) create a new blocker that defeats the purpose?
2. What's the real-world dropout point — do people fail to capture the intent at all, or do they capture it but then ignore/distrust the resulting reminder?
3. How accurate does transcription/intent-parsing need to be before errors themselves become a source of frustration (e.g., mishearing "nails" as something else)?

### On the reminder/follow-up design

1. What does a "gentle" follow-up actually look like in language and timing, from the user's own description — not your guess? (Ask ADHD users directly: describe the best reminder anyone/anything has ever given you, and the worst.)
2. At what point does a follow-up cross from "helpful nudge" into "nagging" for a given person, and does that threshold change based on time of day, task type, or mood?
3. Does a missed/ignored reminder need repair (an apology-free re-ask) or does repeated ignoring signal the AI should just stop and try a different channel/timing next time?

### On the persona / personalization layer

1. How many interactions does it realistically take before a persona-based reminder feels noticeably better than a generic one? (This tells you how long your "cold start" problem lasts.)
2. Should persona-building rely more on explicit self-report (user answering questions about themselves) or inferred behavior (what they actually do) — and where do those two disagree in practice?
3. Are there categories of intent people don't want captured/analyzed at all (embarrassing, private, medical) that need an opt-out or local-only mode?

### On adoption and retention (the "why would this survive week 3" question)

1. What causes people to abandon ADHD-management apps specifically — is it usually forgetting the app exists, distrust after a bad reminder experience, or something else entirely?
2. Would users trust an AI-generated persona enough to act on its suggestions, or does it need a "why am I being reminded now" transparency layer to build trust?