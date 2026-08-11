// Shared intent.json-shaped storage + state-transition helpers (schema/intent.json
// 0.3.0). Factored out of app.js so recovery.js can reuse the same read/write/
// transition logic instead of re-implementing it - both write to the same
// localStorage store and must stay in lockstep on backfill/versioning.

const STORAGE_KEY = "blurt_intents_v0.1.0";

function loadIntents() {
  let intents;
  try {
    intents = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
  // 0.1.0 -> 0.2.0 -> 0.3.0 backfill, mirrors capture/web/app.js - see schema/SCHEMA.md.
  for (const intent of intents) {
    if (intent.state === undefined) intent.state = "dormant";
    if (intent.state_updated_at === undefined) intent.state_updated_at = null;
    if (intent.stall_count === undefined) intent.stall_count = 0;
    if (intent.parent_intent_id === undefined) intent.parent_intent_id = null;
    if (intent.subtasks === undefined) intent.subtasks = [];
    if (intent.deadline === undefined) intent.deadline = null;
    if (intent.deadline_confirmed_absent === undefined) intent.deadline_confirmed_absent = false;
  }
  return intents;
}

function saveIntents(intents) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(intents));
}

function findIntent(intents, id) {
  return intents.find((i) => i.id === id);
}

function newIntent(text, captureMethod) {
  return {
    id: crypto.randomUUID(),
    text,
    captured_at: new Date().toISOString(),
    capture_method: captureMethod,
    reminder_sent_at: null,
    follow_up_count: 0,
    resolution_status: "unresolved",
    resolved_at: null,
    category: null,
    state: "dormant",
    state_updated_at: null,
    stall_count: 0,
    parent_intent_id: null,
    subtasks: [],
    deadline: null,
    deadline_confirmed_absent: false
  };
}

function resolve(intent, resolutionStatus) {
  intent.resolution_status = resolutionStatus;
  intent.resolved_at = new Date().toISOString();
  intent.state = resolutionStatus === "no_longer_relevant" ? "dropped" : "resolved";
  intent.state_updated_at = intent.resolved_at;
}

function defer(intent) {
  intent.state = "deferred";
  intent.state_updated_at = new Date().toISOString();
}

function stall(intent) {
  intent.stall_count += 1;
  intent.state = "stalled";
  intent.state_updated_at = new Date().toISOString();
}

// Mirrors the mockup's per-state tag color coding (screen 6, "Home — intent
// feed"): neutral for dormant/deferred, accent for stalled/needs-attention,
// accent-2 for surfaced/active, outline for settled (resolved/dropped).
function tagClassForState(state) {
  switch (state) {
    case "stalled":
    case "flagged_for_recovery":
      return "tag-accent";
    case "surfaced":
      return "tag-accent-2";
    case "resolved":
    case "dropped":
      return "tag-outline";
    default:
      return "tag-neutral";
  }
}
