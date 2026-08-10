// Frontend Agent, steps 2-3 of the build sequence (AGENTS.md).
// Step 2: manually hand-triggered direct/inquiring check-ins, to test whether the
// two framings feel different before any automated moment/urgency/receptivity
// detection exists. No inference here - the human picks the framing via the radio
// toggle, same as tapping a mockup.
// Step 3: a rule-based "not sure" fallback for the confusable moment pairs named in
// the roadmap's six-moments detection table (Notion, 2026-08-10) - A/C ("don't know
// what to do" vs "started, got distracted") and B/E ("can't start" vs "didn't do
// what I planned"). Nothing here infers which moment it actually is; it just
// recognizes when the signal is too thin to guess confidently and asks directly
// instead, per that section's decision. This is rule-based on purpose - the real
// moment/urgency/receptivity detection is step 4, once the persona layer exists.

const STORAGE_KEY = "blurt_intents_v0.1.0";

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");
const checkinEl = document.getElementById("checkin");
const checkinSource = document.getElementById("checkin-source");
const checkinKicker = document.getElementById("checkin-kicker");
const checkinTitle = document.getElementById("checkin-title");
const checkinBody = document.getElementById("checkin-body");
const checkinList = document.getElementById("checkin-list");
const checkinActions = document.getElementById("checkin-actions");
const checkinClose = document.getElementById("checkin-close");

let activeIntentId = null;

function loadIntents() {
  let intents;
  try {
    intents = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
  // Same 0.1.0 -> 0.2.0 backfill as capture/web/app.js - see schema/SCHEMA.md.
  for (const intent of intents) {
    if (intent.state === undefined) intent.state = "dormant";
    if (intent.state_updated_at === undefined) intent.state_updated_at = null;
    if (intent.stall_count === undefined) intent.stall_count = 0;
    // 0.2.0 -> 0.3.0 backfill (decomposition/deadline fields).
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

function renderFeed() {
  // Subtasks stay off the main feed - they surface through their parent's rollup
  // (decomposition decision #4: no per-subtask nudges cluttering the primary list).
  const intents = loadIntents()
    .filter((i) => !i.parent_intent_id)
    .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));

  feedEl.innerHTML = "";
  emptyEl.hidden = intents.length > 0;

  for (const intent of intents) {
    const li = document.createElement("li");
    li.className = "feed-item state-" + intent.state;
    if (intent.state === "resolved" || intent.state === "dropped") {
      li.classList.add("settled");
    }

    const text = document.createElement("span");
    text.className = "feed-text";
    text.textContent = intent.text;

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = intent.state;

    li.appendChild(text);
    if (intent.state !== "resolved" && intent.state !== "dropped" && isAmbiguous(intent)) {
      const notSureTag = document.createElement("span");
      notSureTag.className = "tag tag-ambiguous";
      notSureTag.textContent = "not sure";
      li.appendChild(notSureTag);
    }
    if (intent.subtasks.length > 0) {
      const subtaskTag = document.createElement("span");
      subtaskTag.className = "tag";
      subtaskTag.textContent = `${intent.subtasks.length} subtask${intent.subtasks.length === 1 ? "" : "s"}`;
      li.appendChild(subtaskTag);
    }
    li.appendChild(tag);

    if (intent.state !== "resolved" && intent.state !== "dropped") {
      li.addEventListener("click", () => openCheckin(intent.id));
    }

    feedEl.appendChild(li);
  }
}

// Copy per the roadmap's Intervention Decision Engine (Notion, 2026-08-10):
// direct and inquiring are the two framings drafted first; activation-only and
// silent-recovery are deferred until these two are validated in real use.
function framingCopy(intent, framing) {
  if (framing === "direct") {
    return {
      kicker: "Check-in",
      title: intent.text,
      body: "You mentioned this earlier.",
      actions: [
        { label: "Done", handler: (i) => resolve(i, "done") },
        { label: "Not yet", handler: (i) => defer(i) },
        { label: "Something else happened", handler: (i) => resolve(i, "done_adjacent"), ghost: true }
      ]
    };
  }
  // inquiring
  const stalledNote = intent.stall_count > 0
    ? `Still stalled, ${intent.stall_count === 1 ? "once" : intent.stall_count + " times"}.`
    : "This has been sitting a while.";
  return {
    kicker: stalledNote,
    title: "Still on your mind, or can this go?",
    body: `“${intent.text}”`,
    actions: [
      { label: "Still there", handler: (i) => stall(i) },
      { label: "Let it go", handler: (i) => resolve(i, "no_longer_relevant") },
      { label: "Handled a different way", handler: (i) => resolve(i, "done_adjacent"), ghost: true }
    ]
  };
}

// A/C signal: vague, no named object - can't tell "don't know what to do" from
// "started, got distracted" without an "active task" concept the design doc flags
// as not built yet, so a vague capture is the closest rule-based proxy available.
const VAGUE_PHRASES = ["ugh", "what now", "hmm", "idk", "i don't know", "something"];

function isVagueText(text) {
  const t = text.trim().toLowerCase();
  if (t.split(/\s+/).filter(Boolean).length <= 2) return true;
  return VAGUE_PHRASES.some((p) => t === p || t.includes(p));
}

// B/E signal: repeatedly stalled - the detection table calls this "easy to confuse
// with E once the resolution window has passed." Threshold of 2 is a starting
// guess, not tuned against real data yet.
function isRepeatStalled(intent) {
  return intent.state === "stalled" && intent.stall_count >= 2;
}

function isAmbiguous(intent) {
  return isVagueText(intent.text) || isRepeatStalled(intent);
}

// Orchestrator Agent, step 4 (AGENTS.md): "Option A" from the roadmap's Section 3.7
// - one call to /api/infer (Vercel serverless function, api/infer.js) returns
// moment + urgency + receptivity + framing together. If it fails or the endpoint
// isn't configured (no MISTRAL_API_KEY, offline, etc.), openCheckin falls back to
// the step 2/3 rule-based/manual flow below rather than breaking the check-in.
async function inferDecision(intent) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("/api/infer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: intent.text,
        state: intent.state,
        stall_count: intent.stall_count,
        captured_at: intent.captured_at,
        resolution_status: intent.resolution_status
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;
    const decision = await res.json();
    if (!decision || !decision.moment) return null;
    return decision;
  } catch {
    return null;
  }
}

// Orchestrator Agent, step 6 (AGENTS.md): task decomposition, MVP.
// Entry dispatcher for opening any intent from the feed or the rollup below.
// AI-judgment-only for v1 (no manual "break this down" trigger, per Ismail's
// 2026-08-10 decision) - decomposition is only ever considered here, on demand,
// and only for top-level intents that haven't been decomposed and aren't
// themselves a subtask (no recursive decomposition).
async function openCheckin(id) {
  activeIntentId = id;
  const intents = loadIntents();
  const intent = findIntent(intents, id);
  if (!intent) return;

  checkinList.innerHTML = "";
  checkinEl.hidden = false;

  if (intent.subtasks.length > 0) {
    renderSubtaskRollup(intent);
    return;
  }

  if (!intent.parent_intent_id) {
    document.getElementById("framing-picker").hidden = true;
    checkinSource.textContent = "";
    checkinSource.className = "checkin-source";
    checkinKicker.textContent = "Thinking…";
    checkinTitle.textContent = "";
    checkinBody.textContent = "";
    checkinActions.innerHTML = "";

    const decomposition = await fetchDecomposition(intent);
    if (activeIntentId !== id) return; // closed/changed while waiting

    if (decomposition && decomposition.decomposable && decomposition.subtasks?.length > 0) {
      renderDecomposeProposal(intent, decomposition.subtasks);
      return;
    }
  }

  await runCheckin(intent, id);
}

// The regular check-in flow (steps 2-4), unchanged in behavior from before step 6 -
// just extracted so both a top-level intent (after declining/skipping decomposition)
// and a subtask opened from the rollup can reach it the same way.
async function runCheckin(intent, id) {
  document.getElementById("framing-picker").hidden = true;
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  checkinKicker.textContent = "Thinking…";
  checkinTitle.textContent = "";
  checkinBody.textContent = "";
  checkinActions.innerHTML = "";
  checkinList.innerHTML = "";

  const decision = await inferDecision(intent);
  if (activeIntentId !== id) return; // closed/changed while waiting

  if (decision) {
    setCheckinSource("auto", `mistral · ${decision.moment} · ${decision.urgency} urgency`);
    if (decision.moment === "not_sure" || !decision.framing) {
      renderNotSure(intent, decision.why);
    } else {
      renderCheckin(decision.framing, decision.why);
    }
    return;
  }

  // Fallback: step 2/3 rule-based/manual flow, unchanged from before step 4.
  setCheckinSource("fallback", "rule-based fallback — AI call failed or MISTRAL_API_KEY not set");
  document.getElementById("framing-picker").hidden = isAmbiguous(intent);
  if (isAmbiguous(intent)) {
    renderNotSure(intent);
  } else {
    const framing = document.querySelector('input[name="framing"]:checked').value;
    renderCheckin(framing);
  }
}

// Decomposition decision #2: never at capture time, only on demand when the user
// opens the item. Fails safe: any error/timeout is treated as "not decomposable"
// rather than blocking the normal check-in.
async function fetchDecomposition(intent) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("/api/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: intent.text }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Decomposition decision #6: AI proposes, user approves or edits before anything
// commits - never silently finalized. Manual edit (add/remove/rewrite rows) is
// explicitly in scope per Ismail's 2026-08-10 "keep it simple, add edit" decision.
function renderDecomposeProposal(intent, subtaskTexts) {
  document.getElementById("framing-picker").hidden = true;
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  checkinKicker.textContent = "This looks like more than one thing";
  checkinTitle.textContent = intent.text;
  checkinBody.textContent = "Split it up? Edit, remove, or add before approving.";

  const rows = subtaskTexts.slice();

  function renderRows() {
    checkinList.innerHTML = "";
    rows.forEach((value, index) => {
      const row = document.createElement("div");
      row.className = "subtask-row";

      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.addEventListener("input", () => { rows[index] = input.value; });
      row.appendChild(input);

      const removeBtn = document.createElement("button");
      removeBtn.className = "subtask-remove";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", "Remove subtask");
      removeBtn.addEventListener("click", () => {
        rows.splice(index, 1);
        renderRows();
      });
      row.appendChild(removeBtn);

      checkinList.appendChild(row);
    });
  }
  renderRows();

  checkinActions.innerHTML = "";

  const addBtn = document.createElement("button");
  addBtn.className = "btn-ghost";
  addBtn.textContent = "+ add subtask";
  addBtn.addEventListener("click", () => {
    rows.push("");
    renderRows();
  });
  checkinActions.appendChild(addBtn);

  const approveBtn = document.createElement("button");
  approveBtn.className = "btn-primary";
  approveBtn.textContent = "Approve";
  approveBtn.addEventListener("click", () => {
    const texts = rows.map((t) => t.trim()).filter(Boolean);
    if (texts.length === 0) return;
    const current = loadIntents();
    const target = findIntent(current, activeIntentId);
    if (target) {
      commitDecomposition(target, texts, current);
      saveIntents(current);
    }
    closeCheckin();
    renderFeed();
  });
  checkinActions.appendChild(approveBtn);

  const skipBtn = document.createElement("button");
  skipBtn.className = "btn-ghost";
  skipBtn.textContent = "Not now — check in on this as-is";
  skipBtn.addEventListener("click", () => runCheckin(intent, intent.id));
  checkinActions.appendChild(skipBtn);
}

// Decomposition decision #3: subtasks are full intents (own state, own
// resolution_status), linked via parent_intent_id/subtasks - not a second schema.
function commitDecomposition(parent, texts, allIntents) {
  const subtaskIds = [];
  for (const text of texts) {
    const subtask = {
      id: crypto.randomUUID(),
      text,
      captured_at: new Date().toISOString(),
      reminder_sent_at: null,
      follow_up_count: 0,
      resolution_status: "unresolved",
      resolved_at: null,
      category: null,
      state: "dormant",
      state_updated_at: null,
      stall_count: 0,
      parent_intent_id: parent.id,
      subtasks: [],
      deadline: null,
      deadline_confirmed_absent: false
    };
    allIntents.push(subtask);
    subtaskIds.push(subtask.id);
  }
  parent.subtasks = subtaskIds;
}

// Decomposition decision #4: subtasks roll up under their parent instead of each
// firing its own individual nudge. Decision #7: parent and subtasks resolve fully
// independently, so the parent itself is always reachable from here too.
function renderSubtaskRollup(intent) {
  document.getElementById("framing-picker").hidden = true;
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  checkinKicker.textContent = "Subtasks";
  checkinTitle.textContent = intent.text;
  checkinBody.textContent = "";

  const allIntents = loadIntents();
  checkinList.innerHTML = "";
  for (const subId of intent.subtasks) {
    const sub = findIntent(allIntents, subId);
    if (!sub) continue;
    const row = document.createElement("div");
    row.className = "subtask-rollup-row";
    const label = document.createElement("span");
    label.textContent = sub.text;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = sub.state;
    row.appendChild(label);
    row.appendChild(tag);
    if (sub.state !== "resolved" && sub.state !== "dropped") {
      row.addEventListener("click", () => openCheckin(sub.id));
    } else {
      row.style.opacity = "0.5";
      row.style.cursor = "default";
    }
    checkinList.appendChild(row);
  }

  checkinActions.innerHTML = "";
  const parentBtn = document.createElement("button");
  parentBtn.className = "btn-ghost";
  parentBtn.textContent = "Check in on this task itself";
  parentBtn.addEventListener("click", () => runCheckin(intent, intent.id));
  checkinActions.appendChild(parentBtn);
}

// Visible for testing purposes (per Ismail's request): makes it obvious whether
// step 4's Mistral call actually ran or the check-in silently fell back to the
// step 2/3 rule-based path - otherwise a missing/broken MISTRAL_API_KEY looks
// identical to the AI just picking the same framing the rules would have.
function setCheckinSource(kind, label) {
  checkinSource.textContent = label;
  checkinSource.className = "checkin-source source-" + kind;
}

// The "not sure" fallback (roadmap Section 3.1, decision on confusable pairs):
// don't guess silently, don't stay dumb either - ask directly, in neutral framing.
// `why` is set when this came from the step-4 model call; absent in the step 2/3
// rule-based fallback path, which has no transparency signal to offer yet.
function renderNotSure(intent, why) {
  checkinKicker.textContent = "Not sure";
  checkinTitle.textContent = "Still working on that, or something new?";
  checkinBody.textContent = why ? `“${intent.text}” — ${why}` : `“${intent.text}”`;

  checkinActions.innerHTML = "";
  const responses = [
    { label: "Still working on it", handler: (i) => defer(i) },
    { label: "Not anymore — let it go", handler: (i) => resolve(i, "no_longer_relevant") }
  ];
  for (const action of responses) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.className = "btn-primary";
    btn.addEventListener("click", () => {
      const current = loadIntents();
      const target = findIntent(current, activeIntentId);
      if (target) {
        action.handler(target);
        saveIntents(current);
      }
      closeCheckin();
      renderFeed();
    });
    checkinActions.appendChild(btn);
  }
}

// `why` (optional): the step-4 model's one-line "why am I being reminded now"
// transparency note (roadmap Section 3.3). Absent when called from the manual
// radio picker or the step 2/3 fallback path.
function renderCheckin(framing, why) {
  const intents = loadIntents();
  const intent = findIntent(intents, activeIntentId);
  if (!intent) return closeCheckin();

  const copy = framingCopy(intent, framing);
  checkinKicker.textContent = copy.kicker;
  checkinTitle.textContent = copy.title;
  checkinBody.textContent = why ? `${copy.body} ${why}` : copy.body;

  checkinActions.innerHTML = "";
  for (const action of copy.actions) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.className = action.ghost ? "btn-ghost" : "btn-primary";
    btn.addEventListener("click", () => {
      const current = loadIntents();
      const target = findIntent(current, activeIntentId);
      if (target) {
        action.handler(target);
        saveIntents(current);
      }
      closeCheckin();
      renderFeed();
    });
    checkinActions.appendChild(btn);
  }
}

function closeCheckin() {
  checkinEl.hidden = true;
  checkinList.innerHTML = "";
  document.getElementById("framing-picker").hidden = false;
  activeIntentId = null;
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

checkinClose.addEventListener("click", closeCheckin);

const resetBtn = document.getElementById("reset-btn");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    if (confirm("Clear all captured intents on this device? This can't be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      renderFeed();
    }
  });
}

document.querySelectorAll('input[name="framing"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    if (activeIntentId) renderCheckin(e.target.value);
  });
});

renderFeed();
