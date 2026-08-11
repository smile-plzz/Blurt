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

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");
const checkinEl = document.getElementById("checkin");
const checkinFramingTag = document.getElementById("checkin-framing-tag");
const checkinSource = document.getElementById("checkin-source");
const checkinKicker = document.getElementById("checkin-kicker");
const checkinTitle = document.getElementById("checkin-title");
const checkinBody = document.getElementById("checkin-body");
const checkinList = document.getElementById("checkin-list");
const checkinActions = document.getElementById("checkin-actions");
const checkinClose = document.getElementById("checkin-close");
const rollupEntry = document.getElementById("rollup-entry");

function setFramingTag(label) {
  if (!label) {
    checkinFramingTag.hidden = true;
    return;
  }
  checkinFramingTag.hidden = false;
  checkinFramingTag.textContent = label;
}

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

  for (const intent of intents) {
    const li = document.createElement("li");
    li.className = "card elev-sm feed-item state-" + intent.state;
    if (intent.state === "resolved" || intent.state === "dropped") {
      li.classList.add("settled");
    }

    const text = document.createElement("p");
    text.className = "card-body feed-text";
    text.textContent = intent.text;
    li.appendChild(text);

    const tagRow = document.createElement("div");
    tagRow.style.display = "flex";
    tagRow.style.gap = "4px";

    if (intent.state !== "resolved" && intent.state !== "dropped" && isAmbiguous(intent)) {
      const notSureTag = document.createElement("span");
      notSureTag.className = "tag tag-accent";
      notSureTag.textContent = "not sure";
      tagRow.appendChild(notSureTag);
    }
    if (intent.subtasks.length > 0) {
      const subtaskTag = document.createElement("span");
      subtaskTag.className = "tag tag-neutral";
      subtaskTag.textContent = `${intent.subtasks.length} subtask${intent.subtasks.length === 1 ? "" : "s"}`;
      tagRow.appendChild(subtaskTag);
    }
    const tag = document.createElement("span");
    tag.className = "tag " + tagClassForState(intent.state);
    if (intent.state === "dropped") tag.style.opacity = "0.7";
    tag.textContent = intent.state;
    tagRow.appendChild(tag);
    li.appendChild(tagRow);

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
      tag: "direct",
      kicker: "Check-in",
      title: intent.text,
      body: "You mentioned this earlier.",
      actions: [
        { label: "Done", handler: (i) => resolve(i, "done"), variant: "primary" },
        { label: "Not yet", handler: (i) => defer(i), variant: "secondary" },
        { label: "Something else happened", handler: (i) => resolve(i, "done_adjacent"), variant: "ghost", fullRow: true }
      ]
    };
  }
  // inquiring
  const stalledNote = intent.stall_count > 0
    ? `Still stalled, ${intent.stall_count === 1 ? "once" : intent.stall_count + " times"}.`
    : "This has been sitting a while.";
  return {
    tag: "inquiring",
    kicker: stalledNote,
    title: "Still on your mind, or can this go?",
    body: `“${intent.text}”`,
    actions: [
      { label: "Still there", handler: (i) => stall(i), variant: "secondary" },
      { label: "Let it go", handler: (i) => resolve(i, "no_longer_relevant"), variant: "ghost" },
      { label: "Handled a different way", handler: (i) => resolve(i, "done_adjacent"), variant: "ghost", fullRow: true }
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
//
// Sends the onboarding persona's relevant fields (2026-08-11) so the model actually
// uses them as priors, per each onboarding question's documented "Changes:" behavior
// (frontend/mockups/Blurt Onboarding Question Flow.dc.html) - previously the persona
// was captured at onboarding and then never read again anywhere in the app.
async function inferDecision(intent) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const persona = loadPersona();
    const res = await fetch("/api/infer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: intent.text,
        state: intent.state,
        stall_count: intent.stall_count,
        captured_at: intent.captured_at,
        resolution_status: intent.resolution_status,
        persona: persona?.onboarding_profile ?? null
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
    setFramingTag(null);
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
  setFramingTag(null);
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
  setFramingTag(null);
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  checkinKicker.textContent = "This looks like more than one step";
  checkinTitle.textContent = intent.text;
  checkinBody.textContent = "Proposed subtasks — edit, exclude, or remove any of these.";

  // { text, included } per row - mockup's checkbox toggles a row out of the
  // approved set without deleting it; the × button removes it outright.
  const rows = subtaskTexts.map((text) => ({ text, included: true }));

  function renderRows() {
    checkinList.innerHTML = "";
    rows.forEach((row, index) => {
      const rowEl = document.createElement("div");
      rowEl.className = "card elev-sm subtask-row" + (row.included ? "" : " excluded");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = row.included;
      checkbox.addEventListener("change", () => {
        row.included = checkbox.checked;
        renderRows();
      });
      rowEl.appendChild(checkbox);

      const input = document.createElement("input");
      input.type = "text";
      input.className = "subtask-text";
      input.value = row.text;
      input.addEventListener("input", () => { row.text = input.value; });
      rowEl.appendChild(input);

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-icon subtask-remove";
      removeBtn.innerHTML = "×";
      removeBtn.setAttribute("aria-label", "Remove subtask");
      removeBtn.addEventListener("click", () => {
        rows.splice(index, 1);
        renderRows();
      });
      rowEl.appendChild(removeBtn);

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
    approveBtn.textContent = `Approve ${includedCount} subtask${includedCount === 1 ? "" : "s"}`;
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
  skipBtn.textContent = "Keep as one item";
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
  setFramingTag(null);
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
    row.className = "card elev-sm subtask-rollup-row";
    const label = document.createElement("span");
    label.textContent = sub.text;
    const tag = document.createElement("span");
    tag.className = "tag " + tagClassForState(sub.state);
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
  parentBtn.className = "btn btn-ghost";
  parentBtn.textContent = "Check in on this task itself";
  parentBtn.addEventListener("click", () => runCheckin(intent, intent.id));
  checkinActions.appendChild(parentBtn);
}

// Reconciles the built per-parent-only rollup above with mockup screen 13
// ("Rollup check-in view"), which shows a *global* pass: every parent with
// pending subtasks, grouped by parent, plus other top-level items that are
// separately resurfacing (stalled/deferred, no subtasks of their own) - one
// shared "that's enough for now" exit instead of nudging through each parent.
// Decision #4 in the roadmap ("compiled into a separate check-in section")
// is about avoiding five separate interruptions; this is that single pass.
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

  // "Also resurfacing": standalone items (no subtasks of their own) that are
  // themselves stalled or deferred - the non-decomposition resurfacing case
  // mockup 13's second section covers ("Book dentist appointment").
  const resurfacing = topLevel.filter(
    (i) => i.subtasks.length === 0 && (i.state === "stalled" || i.state === "deferred")
  );

  return { parentGroups, resurfacing };
}

function updateRollupEntry() {
  const { parentGroups, resurfacing } = collectRollupGroups();
  rollupEntry.hidden = parentGroups.length === 0 && resurfacing.length === 0;
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
    tag.textContent = `stalled ${item.stall_count === 1 ? "once" : item.stall_count + " times"}`;
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

function renderGlobalRollup() {
  const { parentGroups, resurfacing } = collectRollupGroups();
  activeIntentId = null;

  checkinList.innerHTML = "";
  checkinEl.hidden = false;
  document.getElementById("framing-picker").hidden = true;
  setFramingTag(null);
  checkinSource.textContent = "";
  checkinSource.className = "checkin-source";
  checkinKicker.textContent = "";
  checkinTitle.textContent = "A few things to catch up on";
  checkinBody.textContent = "Grouped so this is one pass, not five separate pings.";

  function actOn(item, effect) {
    const current = loadIntents();
    const target = findIntent(current, item.id);
    if (target) {
      effect(target);
      saveIntents(current);
    }
    renderFeed();
    renderGlobalRollup();
  }

  for (const { parent, pending } of parentGroups) {
    const group = document.createElement("div");
    group.className = "rollup-group";
    const label = document.createElement("p");
    label.className = "rollup-group-label";
    label.textContent = parent.text;
    group.appendChild(label);
    for (const sub of pending) {
      group.appendChild(
        rollupRow(sub, {
          onDone: () => actOn(sub, (i) => resolve(i, "done")),
          onNotYet: () => actOn(sub, (i) => stall(i))
        })
      );
    }
    checkinList.appendChild(group);
  }

  if (resurfacing.length > 0) {
    const group = document.createElement("div");
    group.className = "rollup-group";
    const label = document.createElement("p");
    label.className = "rollup-group-label";
    label.textContent = "Also resurfacing";
    group.appendChild(label);
    for (const item of resurfacing) {
      group.appendChild(
        rollupRow(item, {
          onDone: () => actOn(item, (i) => resolve(i, "done")),
          onNotYet: () => actOn(item, (i) => stall(i))
        })
      );
    }
    checkinList.appendChild(group);
  }

  if (parentGroups.length === 0 && resurfacing.length === 0) {
    checkinTitle.textContent = "All caught up";
    checkinBody.textContent = "";
  }

  checkinActions.innerHTML = "";
  const exitBtn = document.createElement("button");
  exitBtn.className = "btn btn-ghost btn-block";
  exitBtn.style.height = "44px";
  exitBtn.textContent = "That's enough for now";
  exitBtn.addEventListener("click", closeCheckin);
  checkinActions.appendChild(exitBtn);
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
  setFramingTag("not sure");
  checkinKicker.textContent = why || "Signal's thin — asking directly instead of guessing";
  checkinTitle.textContent = "Still working on that, or something new?";
  checkinBody.textContent = `“${intent.text}”`;

  checkinActions.innerHTML = "";
  const responses = [
    { label: "Still working on it", handler: (i) => defer(i), variant: "primary" },
    { label: "Not anymore — let it go", handler: (i) => resolve(i, "no_longer_relevant"), variant: "secondary" }
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
  setFramingTag(copy.tag);
  checkinKicker.textContent = copy.kicker;
  checkinTitle.textContent = copy.title;
  checkinBody.textContent = why ? `${copy.body} ${why}` : copy.body;

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
  setFramingTag(null);
  document.getElementById("framing-picker").hidden = false;
  activeIntentId = null;
}

checkinClose.addEventListener("click", closeCheckin);
rollupEntry.addEventListener("click", renderGlobalRollup);

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
