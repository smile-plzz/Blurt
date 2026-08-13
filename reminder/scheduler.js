// Reminder & Tone Agent (AGENTS.md §4) - scheduling module, MVP.
// Not yet wired to a live trigger: this PWA has no push/background-notification
// infra (that's native-shell work, same category as the widget access point in
// capture/REVIEW.md §2). This module is the timing + repair-vs-switch decision
// logic, testable standalone against fake intents, per AGENTS.md's instruction to
// prototype copy and timing before any backend scheduling logic is built.
//
// Copy variants: the in-app check-in copy (direct/inquiring) already lives in
// frontend/web/app.js's framingCopy() - not duplicated here. What's still missing,
// and out of scope for this module, is push/notification-surface copy (the text
// that would appear on a lock screen before the user opens the check-in), because
// there's no notification channel yet to test it against. See "What's still open"
// at the bottom of this file.
//
// Stubbed with fixed intervals, exactly as AGENTS.md §4 and reminder/README.md
// say to start ("can stub with fixed intervals first" / "Persona Agent's inferred
// reminder windows once available"). schema/persona.json's inferred_patterns.
// best_reminder_windows is empty until the Persona Agent's inference pass writes
// it - when it does, DEFAULT_WINDOW_HOURS below is what gets replaced per-user.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Untuned starting guesses (AGENTS.md flags timing/copy as needing real reactions
// from real ADHD users before any default is trustworthy - see OPEN_QUESTIONS.md
// item 8). First follow-up is soonest; each subsequent one backs off, both because
// hammering a stalled item is exactly the nagging failure mode the source doc
// warns about, and because a longer gap gives a "not now" its own room before
// re-asking.
const DEFAULT_FOLLOWUP_DELAYS_MS = [4 * HOUR_MS, 1 * DAY_MS, 3 * DAY_MS];

// Maps schedule_hint.window (from api/orchestrator.js's Step B, sourced from
// inferred_patterns.best_reminder_windows once that exists) to an hour-of-day.
// Fixed mapping, not learned - the Persona Agent owns turning behavior into a
// real per-user window; this is only the fallback when a window string exists
// but there's no finer-grained data yet.
const WINDOW_HOUR = {
  mornings: 9,
  "late morning": 11,
  "early evening": 18,
  nights: 21,
};

function clampFollowUpIndex(followUpCount) {
  return Math.min(followUpCount, DEFAULT_FOLLOWUP_DELAYS_MS.length - 1);
}

// Given the intent's own history and the orchestrator's schedule_hint (may be
// null - e.g. when moment was "not_sure" and Step B returned no schedule_hint),
// returns the next check-in timestamp. Pure function: takes `now` explicitly so
// it's testable without mocking the clock.
function nextCheckinAt(intent, scheduleHint, now = new Date()) {
  const delayMs = DEFAULT_FOLLOWUP_DELAYS_MS[clampFollowUpIndex(intent.follow_up_count ?? 0)];
  let target = new Date(now.getTime() + delayMs);

  const windowHour = WINDOW_HOUR[scheduleHint?.window];
  if (windowHour !== undefined) {
    target.setHours(windowHour, 0, 0, 0);
    // If the computed window has already passed today relative to `target`'s
    // own date, push to the same window the next day rather than firing late.
    if (target.getTime() < now.getTime() + delayMs) target.setDate(target.getDate() + 1);
  }

  return target.toISOString();
}

// OPEN_QUESTIONS.md item 10 / reminder/README.md "Repair vs. channel switch":
// design answer already given in AGENTS.md's Notion-roadmap-sourced sequencing
// note - repeated ignoring means a receptivity-driven switch to silent-recovery
// framing, not an escalating per-item repair loop. This function is that design
// answer as code, still needs real-use validation per OPEN_QUESTIONS.md's
// "partial" status on that item - it is not being marked "answered" here.
//
// followUpCountMax comes from the orchestrator's schedule_hint (default 2-3 per
// orchestrator/REVIEW.md's Step B spec) - the Reminder Agent decides exact
// cadence, this is that decision.
function decideFollowUpAction(intent, scheduleHint) {
  const max = scheduleHint?.follow_up_count_max ?? 2;
  const followUpCount = intent.follow_up_count ?? 0;

  if (intent.state === "flagged_for_recovery") {
    // Recovery Mode is a separate, aggregate flow (frontend/web/recovery.js) -
    // this module doesn't re-decide it, just declines to schedule a normal
    // check-in on top of it.
    return { action: "defer_to_recovery_mode", reminder_style: null };
  }

  if (followUpCount === 0) {
    // First-ever check-in for this intent: no repair needed, nothing to repeat yet.
    return { action: "check_in", reminder_style: scheduleHint?.reminder_style ?? "inquiring_check_in" };
  }

  if (followUpCount <= max) {
    // Apology-free re-ask - same framing, no acknowledgment of the miss. Per the
    // source doc's flag: treating one miss as failure is the shame-machine
    // failure mode this product exists to avoid.
    return { action: "repair", reminder_style: scheduleHint?.reminder_style ?? "inquiring_check_in" };
  }

  // Repeated ignoring past the max: switch to silent-recovery framing - fold
  // into the passive rollup/feed rather than firing another active nudge.
  return { action: "silent_recovery_fold_in", reminder_style: "silent_recovery_fold_in" };
}

// What's still open (tracked here, not silently assumed done):
// - Push/notification-surface copy: no channel exists yet to draft/test it against.
// - Real nagging-threshold tuning: DEFAULT_FOLLOWUP_DELAYS_MS and WINDOW_HOUR are
//   untuned starting guesses, per OPEN_QUESTIONS.md item 8/9's "needs real-use
//   validation" status - do not treat these numbers as settled defaults.
// - activation-only / silent-recovery in-app copy: only the reminder_style label
//   exists here; frontend/web/app.js's framingCopy() only implements direct/inquiring.

if (typeof window !== "undefined") window.blurtReminderScheduler = { nextCheckinAt, decideFollowUpAction };
if (typeof module !== "undefined") module.exports = { nextCheckinAt, decideFollowUpAction };
