// Recovery Mode entry (mockup screen 10, roadmap Section 3.4). Reached only
// via app.js's maybeEnterRecovery() gate - never linked to directly, so a
// direct visit still works but isn't how users normally arrive here.
//
// Strict 3-step order, per the spec: (1) acknowledge return with zero
// reference to gap length or item count - this page never shows one; (2) one
// open question, free text/voice; (3) only after that response, optionally
// surface 1-2 old stalled items, inquiring-framed, never a backlog dump.

const input = document.getElementById("recovery-input");
const micBtn = document.getElementById("recovery-mic");
const continueBtn = document.getElementById("recovery-continue");
const followup = document.getElementById("recovery-followup");

input.addEventListener("input", () => {
  continueBtn.disabled = input.value.trim().length === 0;
});

// --- voice (single utterance, same pattern as capture/web/app.js) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let capturedByVoice = false;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("result", (e) => {
    const text = e.results[0][0].transcript;
    input.value = (input.value ? input.value + " " : "") + text;
    capturedByVoice = true;
    continueBtn.disabled = input.value.trim().length === 0;
  });

  micBtn.addEventListener("click", () => recognition.start());
} else {
  micBtn.disabled = true;
}

// --- step 2 -> step 3 ---
continueBtn.addEventListener("click", () => {
  const text = input.value.trim();
  if (!text) return;

  const intents = loadIntents();
  intents.push(newIntent(text, capturedByVoice ? "voice" : "typed_fallback"));
  saveIntents(intents);

  document.getElementById("recovery-welcome").hidden = true;
  document.getElementById("recovery-step2").hidden = true;

  renderFollowups();
});

// Ranked by urgency proxy (stall_count - the roadmap's "urgency tier" isn't a
// stored field yet) then recency, per decision "rank by urgency tier first,
// recency as tiebreak. Skip topic/keyword matching for v1." At most 2 items,
// shown one at a time, never as a list/count - a backlog dump is explicitly
// what this screen must avoid.
function pickStalledItems() {
  return loadIntents()
    .filter((i) => !i.parent_intent_id && (i.state === "stalled" || i.state === "flagged_for_recovery"))
    .sort((a, b) => b.stall_count - a.stall_count || new Date(b.captured_at) - new Date(a.captured_at))
    .slice(0, 2);
}

function renderFollowups() {
  const queue = pickStalledItems();
  followup.hidden = false;

  function showNext() {
    if (queue.length === 0) {
      window.location.href = "/frontend/web/";
      return;
    }
    const item = queue.shift();
    followup.innerHTML = "";

    const card = document.createElement("div");
    card.className = "card elev-sm";
    card.style.background = "var(--color-surface)";

    const kicker = document.createElement("p");
    kicker.className = "card-kicker";
    kicker.textContent = "A moment later";
    card.appendChild(kicker);

    const body = document.createElement("p");
    body.className = "card-body";
    body.style.opacity = "1";
    body.style.fontSize = "14px";
    body.textContent = `You'd also mentioned "${item.text}" a while back — still relevant, or should I drop it?`;
    card.appendChild(body);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "4px";

    const keepBtn = document.createElement("button");
    keepBtn.className = "btn btn-secondary";
    keepBtn.style.flex = "1";
    keepBtn.style.height = "42px";
    keepBtn.style.fontSize = "13px";
    keepBtn.textContent = "Still relevant";
    keepBtn.addEventListener("click", () => {
      const current = loadIntents();
      const target = findIntent(current, item.id);
      if (target) {
        defer(target);
        saveIntents(current);
      }
      showNext();
    });
    actions.appendChild(keepBtn);

    const dropBtn = document.createElement("button");
    dropBtn.className = "btn btn-ghost";
    dropBtn.style.flex = "1";
    dropBtn.style.height = "42px";
    dropBtn.style.fontSize = "13px";
    dropBtn.textContent = "Drop it";
    dropBtn.addEventListener("click", () => {
      const current = loadIntents();
      const target = findIntent(current, item.id);
      if (target) {
        resolve(target, "no_longer_relevant");
        saveIntents(current);
      }
      showNext();
    });
    actions.appendChild(dropBtn);

    card.appendChild(actions);
    followup.appendChild(card);
  }

  showNext();
}
