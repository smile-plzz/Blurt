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

// Intent storage/state-transition helpers (loadIntents, saveIntents, findIntent,
// resolve, defer, stall, tagClassForState) live in intents.js, loaded before this
// file - shared with recovery.js so both write the same localStorage store
// through one code path.

// Build instruments (the manual framing picker, the decision-source readout)
// render only with ?dev=1. They exist to test tone and to tell "the AI ran" from
// "the rule-based fallback ran" during development - neither is product surface,
// and shipping them would put internal taxonomy, a model vendor's name and an
// env-var name in front of a first-time user.
const DEV = new URLSearchParams(location.search).has("dev");

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");
const checkinEl = document.getElementById("checkin");
const checkinSource = document.getElementById("checkin-source");
const checkinKicker = document.getElementById("checkin-kicker");
const checkinTitle = document.getElementById("checkin-title");
const checkinBody = document.getElementById("checkin-body");

function setCheckinBody(text) {
  checkinBody.textContent = text;
  checkinBody.hidden = !text;
}

// The picker is a dev instrument, so "show it" only ever means "show it in dev".
function setFramingPickerHidden(hidden) {
  document.getElementById("framing-picker").hidden = hidden || !DEV;
}

// Mockup screens 07/08: the "why am I being reminded now" transparency note is
// its own disclosure, closed by default - never concatenated into the question
// body, never competing with it for attention.
const checkinWhyToggle = document.getElementById("checkin-why-toggle");
const checkinWhyNote = document.getElementById("checkin-why");
checkinWhyToggle.addEventListener("click", () => {
  const open = checkinWhyToggle.classList.toggle("open");
  checkinWhyNote.hidden = !open;
});
function setCheckinWhy(why) {
  checkinWhyToggle.classList.remove("open");
  checkinWhyNote.hidden = true;
  checkinWhyNote.textContent = why || "";
  checkinWhyToggle.hidden = !why;
}
const checkinList = document.getElementById("checkin-list");
const checkinActions = document.getElementById("checkin-actions");
const rollupEntry = document.getElementById("rollup-entry");

let activeIntentId = null;

function renderFeed() {
  // Subtasks stay off the main feed - they surface through their parent's rollup
  // (decomposition decision #4: no per-subtask nudges cluttering the primary list).
  const intents = loadIntents()
    .filter((i) => !i.parent_intent_id)
    .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));

  feedEl.innerHTML = "";
  emptyEl.hidden = intents.length > 0;
  updateRollupEntry();

  // "Closed this week" (mockup screen 06): closed items (resolved/dropped) get
  // their own dimmed section below the open ones, rather than sitting mixed
  // into the same undifferentiated list. Still visible, never hidden - closed
  // is not deleted.
  const open = intents.filter((i) => i.state !== "resolved" && i.state !== "dropped");
  const closed = intents.filter((i) => i.state === "resolved" || i.state === "dropped");

  for (const intent of open) feedEl.appendChild(buildFeedRow(intent));

  if (closed.length > 0) {
    const label = document.createElement("li");
    label.className = "feed-section-label";
    label.textContent = "Closed this week";
    feedEl.appendChild(label);
    for (const intent of closed) feedEl.appendChild(buildFeedRow(intent));
  }
}

function buildFeedRow(intent) {
  const li = document.createElement("li");
  li.className = "card elev-sm feed-item state-" + intent.state;
  if (intent.state === "resolved" || intent.state === "dropped") {
    li.classList.add("settled");
  }

  const text = document.createElement("span");
  text.className = "feed-text";
  text.textContent = intent.text;
  li.appendChild(text);

  const tagRow = document.createElement("div");
  tagRow.className = "feed-tag-row";

  // A decomposed parent shows its open-step count instead of its own lifecycle
  // state. Everything else goes through stateLabel(), which returns null for the
  // resting states - per the mockup's own rule, absence of a tag is the resting
  // state, so only rows with something to say carry one.
  let label;
  if (intent.subtasks.length > 0 && intent.state !== "resolved" && intent.state !== "dropped") {
    const openCount = pendingSubtasksOf(intent, loadIntents()).length;
    label = `${openCount} step${openCount === 1 ? "" : "s"} left`;
  } else {
    label = stateLabel(intent.state);
  }

  if (label) {
    const tag = document.createElement("span");
    tag.className = "tag " + tagClassForState(intent.state);
    tag.textContent = label;
    tagRow.appendChild(tag);
  }
  li.appendChild(tagRow);

  if (intent.state !== "resolved" && intent.state !== "dropped") {
    // A decomposed parent opens the full Task detail page (mockup screen 13)
    // instead of the check-in flow - checking in "on the text" doesn't make
    // sense once it has real subtasks with their own states.
    if (intent.subtasks.length > 0) {
      li.addEventListener("click", () => {
        window.location.href = "/frontend/web/task.html?id=" + encodeURIComponent(intent.id);
      });
    } else {
      li.addEventListener("click", () => openCheckin(intent.id));
    }
  }

  return li;
}

// Copy per the roadmap's Intervention Decision Engine (Notion, 2026-08-10):
// direct and inquiring are the two framings drafted first; activation-only and
// silent-recovery are deferred until these two are validated in real use.
function framingCopy(intent, framing) {
  if (framing === "direct") {
    return {
      kicker: "Earlier today",
      title: intent.text,
      body: "",
      actions: [
        { label: "Done", handler: (i) => resolve(i, "done"), variant: "primary" },
        { label: "Not yet", handler: (i) => defer(i), variant: "secondary" },
        { label: "Did it another way", handler: (i) => resolve(i, "done_adjacent"), variant: "ghost", fullRow: true }
      ]
    };
  }
  // inquiring
  // Deliberately not "mentioned twice this week": nothing here checks a time
  // window, so that phrasing states a specific the data can't back. For an app
  // whose whole pitch is that its resurfacing can be trusted, a confident wrong
  // detail costs more than a vaguer true one.
  const stalledNote = intent.stall_count > 0
    ? "This keeps coming back"
    : "Still open";
  return {
    kicker: stalledNote,
    title: "Still on your mind, or can this go?",
    body: `“${intent.text}”`,
    actions: [
      { label: "Still on my mind", handler: (i) => stall(i), variant: "primary" },
      { label: "Let it go", handler: (i) => resolve(i, "no_longer_relevant"), variant: "secondary" },
      { label: "Did it another way", handler: (i) => resolve(i, "done_adjacent"), variant: "ghost", fullRow: true }
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

// Orchestrator Agent (AGENTS.md §6): calls /api/orchestrator (api/orchestrator.js),
// which runs the two-step persona-read -> reminder-plan pipeline specced in
// orchestrator/REVIEW.md and returns moment + urgency + receptivity + framing +
// why (plus schedule_hint/decomposition_candidate, not yet consumed here - the
// Reminder Agent and decomposition-signal wiring land later). If the call fails
// or the endpoint isn't configured (no MISTRAL_API_KEY, offline, etc.),
// openCheckin falls back to the step 2/3 rule-based/manual flow below rather
// than breaking the check-in. Supersedes the old direct /api/infer call (kept in
// place as a fallback endpoint during the transition, per REVIEW.md §4) - this
// function's signature and return shape are unchanged, so nothing downstream of
// inferDecision() needs to change.
async function inferDecision(intent) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const persona = loadPersona();
    const res = await fetch("/api/orchestrator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent,
        persona: persona
          ? { onboarding_profile: persona.onboarding_profile ?? null, inferred_patterns: persona.inferred_patterns ?? null }
          : null
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

  if (!intent.parent_intent_id) {
    setFramingPickerHidden(true);
    checkinSource.textContent = "";
    checkinSource.className = "checkin-source";
    checkinKicker.textContent = "Thinking…";
    checkinTitle.textContent = "";
    setCheckinBody("");
    setCheckinWhy(null);
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
  setFramingPickerHidden(true);
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  checkinKicker.textContent = "Thinking…";
  checkinTitle.textContent = "";
  setCheckinBody("");
  setCheckinWhy(null);
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
  setFramingPickerHidden(isAmbiguous(intent));
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
  setFramingPickerHidden(true);
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  checkinKicker.textContent = "Looks like more than one thing";
  checkinTitle.textContent = intent.text;
  setCheckinBody("Change anything below. Nothing is saved until you say so.");
  setCheckinWhy(null);

  // { text, included } per row - the round check-icon toggles a row out of the
  // approved set without deleting it (mockup screen 11: no separate remove
  // control, excluding is the only edit a row needs beyond its text).
  const rows = subtaskTexts.map((text) => ({ text, included: true }));

  function renderRows() {
    checkinList.innerHTML = "";
    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "card elev-sm subtask-row" + (row.included ? "" : " excluded");

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "subtask-toggle" + (row.included ? " checked" : "");
      toggle.setAttribute("aria-label", row.included ? "Exclude this step" : "Include this step");
      toggle.innerHTML = row.included
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : "";
      toggle.addEventListener("click", () => {
        row.included = !row.included;
        renderRows();
      });
      rowEl.appendChild(toggle);

      const input = document.createElement("input");
      input.type = "text";
      input.className = "subtask-text";
      input.value = row.text;
      input.addEventListener("input", () => { row.text = input.value; });
      rowEl.appendChild(input);

      checkinList.appendChild(rowEl);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-ghost subtask-add";
    addBtn.textContent = "+ Add a step";
    addBtn.addEventListener("click", () => {
      rows.push({ text: "", included: true });
      renderRows();
    });
    checkinList.appendChild(addBtn);

    const includedCount = rows.filter((r) => r.included).length;
    // "Keep these one" was reachable when every row but one is excluded.
    approveBtn.textContent = includedCount === 1 ? "Keep this step" : `Keep these ${includedCount}`;
    approveBtn.disabled = includedCount === 0;
  }

  checkinActions.innerHTML = "";

  const approveBtn = document.createElement("button");
  approveBtn.className = "btn btn-primary btn-block";
  approveBtn.style.height = "48px";
  approveBtn.addEventListener("click", () => {
    const texts = rows.filter((r) => r.included).map((r) => r.text.trim()).filter(Boolean);
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
  renderRows();

  const skipBtn = document.createElement("button");
  skipBtn.className = "btn btn-ghost";
  skipBtn.style.alignSelf = "center";
  skipBtn.textContent = "Leave it as one thing";
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

// Rollup check-in (mockup screen 12, resolved to per-parent scope in the
// refined mockup pass - the earlier global version that pulled every parent's
// pending subtasks plus unrelated resurfacing items into one screen is
// retired). One parent, one pass; anything else waits its turn and surfaces
// next time the entry button is pressed (or from its own feed row via Task
// detail). Standalone resurfacing items (no subtasks of their own) already
// have their own check-in reachable straight from the feed - no separate
// section needed here.
function pendingSubtasksOf(parent, allIntents) {
  return parent.subtasks
    .map((id) => findIntent(allIntents, id))
    .filter((s) => s && s.state !== "resolved" && s.state !== "dropped");
}

function collectRollupGroups() {
  const allIntents = loadIntents();
  const topLevel = allIntents.filter((i) => !i.parent_intent_id);

  const parentGroups = [];
  for (const parent of topLevel) {
    if (parent.subtasks.length === 0) continue;
    const pending = pendingSubtasksOf(parent, allIntents);
    if (pending.length > 0) parentGroups.push({ parent, pending });
  }

  return parentGroups;
}

function updateRollupEntry() {
  const groups = collectRollupGroups();
  rollupEntry.hidden = groups.length === 0;
  // Name the actual thing rather than describing the mechanism ("check in on
  // pending steps"). The user knows what "Birthday party" is; they don't think
  // of their own life in terms of parents, rollups or pending steps.
  if (groups.length > 0) {
    const { parent, pending } = groups[0];
    rollupEntry.textContent = `${parent.text} — ${pending.length} step${pending.length === 1 ? "" : "s"} left`;
  }
}

function rollupRow(item, { onDone, onNotYet }) {
  const row = document.createElement("div");
  row.className = "card elev-sm rollup-row";

  const label = document.createElement("span");
  label.textContent = item.text;
  row.appendChild(label);

  if (item.stall_count > 0) {
    const tag = document.createElement("span");
    tag.className = "tag tag-accent";
    tag.textContent = "stuck";
    row.appendChild(tag);
  }

  const actions = document.createElement("div");
  actions.className = "rollup-row-actions";

  const doneBtn = document.createElement("button");
  doneBtn.className = "btn btn-secondary";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", onDone);
  actions.appendChild(doneBtn);

  const notYetBtn = document.createElement("button");
  notYetBtn.className = "btn btn-ghost";
  notYetBtn.textContent = "Not yet";
  notYetBtn.addEventListener("click", onNotYet);
  actions.appendChild(notYetBtn);

  row.appendChild(actions);
  return row;
}

function renderRollup() {
  const parentGroups = collectRollupGroups();
  activeIntentId = null;

  checkinList.innerHTML = "";
  checkinEl.hidden = false;
  setFramingPickerHidden(true);
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  setCheckinWhy(null);

  if (parentGroups.length === 0) {
    checkinKicker.textContent = "";
    checkinTitle.textContent = "All caught up";
    setCheckinBody("");
    checkinActions.innerHTML = "";
    const exitBtn = document.createElement("button");
    exitBtn.className = "btn btn-ghost btn-block";
    exitBtn.style.height = "44px";
    exitBtn.textContent = "That's enough for now";
    exitBtn.addEventListener("click", closeCheckin);
    checkinActions.appendChild(exitBtn);
    return;
  }

  // Just the first parent with pending steps - one pass, not a merged view
  // across unrelated parents. Anything else waits its turn (mockup screen 12).
  const { parent, pending } = parentGroups[0];
  const count = pending.length;
  checkinKicker.textContent = parent.text;
  checkinTitle.textContent = count === 1 ? "One step left" : `${count} steps, all at once`;
  setCheckinBody("Just this one thing. Everything else can wait.");

  function actOn(item, effect) {
    const current = loadIntents();
    const target = findIntent(current, item.id);
    if (target) {
      effect(target);
      saveIntents(current);
    }
    renderFeed();
    renderRollup();
  }

  for (const sub of pending) {
    checkinList.appendChild(
      rollupRow(sub, {
        onDone: () => actOn(sub, (i) => resolve(i, "done")),
        onNotYet: () => actOn(sub, (i) => stall(i))
      })
    );
  }

  checkinActions.innerHTML = "";
  const exitBtn = document.createElement("button");
  exitBtn.className = "btn btn-ghost btn-block";
  exitBtn.style.height = "44px";
  exitBtn.textContent = "That's enough for now";
  exitBtn.addEventListener("click", closeCheckin);
  checkinActions.appendChild(exitBtn);
}

// Dev instrument only (?dev=1): makes it obvious whether the model call actually
// ran or the check-in silently fell back to the rule-based path - otherwise a
// missing/broken MISTRAL_API_KEY looks identical to the AI just picking the same
// framing the rules would have. Never rendered for a real user: it names the
// model vendor, the internal moment/urgency taxonomy and an env var, none of
// which mean anything to someone just trying to answer a check-in.
function setCheckinSource(kind, label) {
  if (!DEV) return;
  checkinSource.hidden = false;
  checkinSource.textContent = label;
  checkinSource.className = "checkin-source source-" + kind;
}

// The "not sure" fallback (roadmap Section 3.1, decision on confusable pairs):
// don't guess silently, don't stay dumb either - ask directly, in neutral framing.
// `why` is set when this came from the step-4 model call; absent in the step 2/3
// rule-based fallback path, which has no transparency signal to offer yet.
function renderNotSure(intent, why) {
  checkinKicker.textContent = "Asking rather than guessing";
  checkinTitle.textContent = "Still working on that, or something new?";
  setCheckinBody(`“${intent.text}”`);
  setCheckinWhy(why);

  checkinActions.innerHTML = "";
  const responses = [
    { label: "Still on that", handler: (i) => defer(i), variant: "primary" },
    { label: "Something new", handler: (i) => resolve(i, "no_longer_relevant"), variant: "secondary" }
  ];
  for (const action of responses) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.className = "btn btn-" + action.variant + " btn-block";
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
  setCheckinBody(copy.body);
  setCheckinWhy(why);

  checkinActions.innerHTML = "";
  const actionRow = document.createElement("div");
  actionRow.className = "action-row";
  checkinActions.appendChild(actionRow);

  for (const action of copy.actions) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.className = "btn btn-" + action.variant;
    if (action.fullRow) btn.classList.add("full-row");
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
    (action.fullRow ? checkinActions : actionRow).appendChild(btn);
  }
}

function closeCheckin() {
  checkinEl.hidden = true;
  checkinList.innerHTML = "";
  setFramingPickerHidden(false);
  activeIntentId = null;
}

// No visible "close" link in the refined mockup - every check-in screen exits
// via one of its own labeled actions. Tapping the backdrop (outside the sheet)
// is the equivalent affordance for changing your mind without picking one.
checkinEl.addEventListener("click", (e) => {
  if (e.target === checkinEl) closeCheckin();
});
rollupEntry.addEventListener("click", renderRollup);

// "reset test data" moved into settings.html's "Delete everything" (Data
// section, mockup screen 11) now that a real settings screen exists.

document.querySelectorAll('input[name="framing"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    if (activeIntentId) renderCheckin(e.target.value);
  });
});

// Entry gate: onboarding first (mockup screens 1-3), then Recovery Mode
// (screen 10) if triggered, per roadmap Section 3.4's decided trigger -
// whichever fires first between a stalled-item threshold and a personal
// gap-since-last-open baseline (seeded at onboarding). Falls through to the
// normal feed otherwise. maybeEnterRecovery/hasCompletedOnboarding/loadPersona
// live in persona.js, loaded before this file.
function maybeEnterRecovery() {
  const persona = loadPersona();
  const now = Date.now();
  const lastOpenRaw = localStorage.getItem(LAST_OPEN_KEY);
  const lastOpen = lastOpenRaw ? Number(lastOpenRaw) : null;
  const gapDays = lastOpen ? (now - lastOpen) / 86400000 : null;
  // gap_baseline_days - Q7 of the onboarding question flow, the one signal
  // Section 3.4 says can't be inferred from behavior later.
  const baselineDays = persona?.onboarding_profile?.gap_baseline_days ?? null;

  const intents = loadIntents();
  // Placeholder threshold, not yet derived from real usage data - roadmap
  // Section 3.4 specifies "crosses a personal threshold" without a number.
  const STALL_THRESHOLD = 3;
  const stalledCount = intents.filter(
    (i) => !i.parent_intent_id && (i.state === "stalled" || i.state === "flagged_for_recovery")
  ).length;

  const shouldRecover = stalledCount >= STALL_THRESHOLD || (gapDays !== null && baselineDays !== null && gapDays > baselineDays);

  localStorage.setItem(LAST_OPEN_KEY, String(now));

  // Session-scoped, not permanent: per Recovery Mode's spec, most stalled
  // items are expected to stay untouched and "age back into STALLED" rather
  // than force a resolution - so the trigger can fire again next session
  // without this flag treating one Recovery Mode visit as solving everything.
  if (shouldRecover && sessionStorage.getItem("blurt_recovery_shown") !== "true") {
    sessionStorage.setItem("blurt_recovery_shown", "true");
    window.location.href = "/frontend/web/recovery.html";
    return true;
  }
  return false;
}

if (!hasCompletedOnboarding()) {
  window.location.href = "/frontend/web/onboarding.html";
} else if (!maybeEnterRecovery()) {
  renderFeed();
}
