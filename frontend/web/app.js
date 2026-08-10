// Frontend Agent, step 2 of the build sequence (AGENTS.md): manually hand-triggered
// direct/inquiring check-ins, to test whether the two framings feel different before
// any automated moment/urgency/receptivity detection exists. No inference here -
// the human picks the framing via the radio toggle, same as tapping a mockup.

const STORAGE_KEY = "blurt_intents_v0.1.0";

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");
const checkinEl = document.getElementById("checkin");
const checkinKicker = document.getElementById("checkin-kicker");
const checkinTitle = document.getElementById("checkin-title");
const checkinBody = document.getElementById("checkin-body");
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
  const intents = loadIntents()
    .slice()
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

function openCheckin(id) {
  activeIntentId = id;
  const framing = document.querySelector('input[name="framing"]:checked').value;
  renderCheckin(framing);
  checkinEl.hidden = false;
}

function renderCheckin(framing) {
  const intents = loadIntents();
  const intent = findIntent(intents, activeIntentId);
  if (!intent) return closeCheckin();

  const copy = framingCopy(intent, framing);
  checkinKicker.textContent = copy.kicker;
  checkinTitle.textContent = copy.title;
  checkinBody.textContent = copy.body;

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

document.querySelectorAll('input[name="framing"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    if (activeIntentId) renderCheckin(e.target.value);
  });
});

renderFeed();
