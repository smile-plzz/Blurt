// Capture Agent: emits raw intent.json-shaped events. No analysis performed here by design.

const STORAGE_KEY = "blurt_intents_v0.1.0";
const SCHEMA_VERSION = "0.3.0";

const captureMain = document.getElementById("capture-main");
const micBtn = document.getElementById("mic-btn");
const statusEl = document.getElementById("status");
const stopHint = document.getElementById("stop-hint");
const pulse1 = document.getElementById("pulse-1");
const pulse2 = document.getElementById("pulse-2");
const pulse3 = document.getElementById("pulse-3");
const typeForm = document.getElementById("type-form");
const typeInput = document.getElementById("type-input");
const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");
const recentEl = document.getElementById("recent");

function setListeningUI(isListening) {
  micBtn.classList.toggle("listening", isListening);
  stopHint.hidden = !isListening;
  pulse1.hidden = !isListening;
  pulse2.hidden = !isListening;
  pulse3.hidden = !isListening;
}

function loadIntents() {
  let intents;
  try {
    intents = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
  // schema 0.1.0 -> 0.2.0 migration: backfill state fields on read, per schema/SCHEMA.md.
  // Pre-existing records already survived capture, so they backfill to "dormant", not "captured".
  for (const intent of intents) {
    if (intent.state === undefined) intent.state = "dormant";
    if (intent.state_updated_at === undefined) intent.state_updated_at = null;
    if (intent.stall_count === undefined) intent.stall_count = 0;
  }
  return intents;
}

function saveIntent(text, captureMethod) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const intent = {
    id: crypto.randomUUID(),
    text: trimmed,
    captured_at: new Date().toISOString(),
    capture_method: captureMethod,
    reminder_sent_at: null,
    follow_up_count: 0,
    resolution_status: "unresolved",
    resolved_at: null,
    category: null,
    state: "captured",
    state_updated_at: null,
    stall_count: 0
  };

  const intents = loadIntents();
  intents.push(intent);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(intents));

  // capture/REVIEW.md item 3: downstream agents (Persona/Reminder/Orchestrator)
  // subscribe to this instead of polling localStorage. Dispatched after the
  // write completes, carrying the same intent.json-shaped object just stored -
  // no analysis added, "capture stays dumb" still holds.
  window.dispatchEvent(new CustomEvent("blurt:intent-captured", { detail: intent }));

  showToast(`Got it — “${trimmed}”`);
  renderRecent();
}

// Minimal tracker (schema/SCHEMA.md 0.2.0 migration note): aggregate counts only, no
// per-intent judgment made here - stays within "capture stays dumb." Nothing calls this
// yet since no UI writes resolved_at/state transitions; exposed for the Persona/Frontend
// agents to consume once they do.
function trackerStats() {
  const intents = loadIntents();
  const latenciesMs = intents
    .filter((i) => i.resolved_at)
    .map((i) => new Date(i.resolved_at) - new Date(i.captured_at));
  const stateCounts = intents.reduce((counts, i) => {
    counts[i.state] = (counts[i.state] || 0) + 1;
    return counts;
  }, {});
  return { schemaVersion: SCHEMA_VERSION, total: intents.length, latenciesMs, stateCounts };
}

function showToast(message) {
  toastText.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 1400);
}

function renderRecent() {
  const intents = loadIntents().slice(-5).reverse();
  recentEl.innerHTML = "";
  for (const i of intents) {
    const li = document.createElement("li");
    li.textContent = i.text;
    recentEl.appendChild(li);
  }
}

// --- typed fallback ---
typeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  saveIntent(typeInput.value, "typed_fallback");
  typeInput.value = "";
  typeInput.blur();
});

// --- voice capture ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const DEFAULT_STATUS = "tap. speak. done.";

if (!SpeechRecognition) {
  // Safari and Firefox land here. The old copy ("voice not supported here")
  // named the failure without explaining it or saying what still works, which
  // reads as "this app is broken" on the one screen that carries the product.
  micBtn.classList.add("unsupported");
  statusEl.textContent = "voice needs chrome or edge — typing works anywhere.";
  typeInput.placeholder = "type it here";
} else {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  // Interim results drive the live "“I should cut my…”" transcript
  // preview (mockup screen 04) - purely a UI preview, saveIntent only ever
  // fires on a final result, so this doesn't change what gets captured.
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let listening = false;
  let finalTranscript = "";

  recognition.addEventListener("result", (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalTranscript += (finalTranscript ? " " : "") + chunk;
      } else {
        interim += chunk;
      }
    }
    statusEl.textContent = `“${(finalTranscript + " " + interim).trim()}”`;
  });

  recognition.addEventListener("end", () => {
    listening = false;
    setListeningUI(false);
    if (finalTranscript.trim()) saveIntent(finalTranscript, "voice");
    finalTranscript = "";
    statusEl.textContent = DEFAULT_STATUS;
  });

  recognition.addEventListener("error", (e) => {
    listening = false;
    setListeningUI(false);
    if (e.error === "no-speech") {
      statusEl.textContent = "didn't catch that. tap to retry.";
    } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      statusEl.textContent = "mic blocked. type it instead.";
    } else {
      statusEl.textContent = DEFAULT_STATUS;
    }
  });

  function startListening() {
    if (listening) return;
    listening = true;
    finalTranscript = "";
    setListeningUI(true);
    statusEl.textContent = "listening…";
    recognition.start();
  }

  function stopListening() {
    if (listening) recognition.stop();
  }

  micBtn.addEventListener("click", startListening);

  // Tap anywhere to stop (mockup screen 04) - once listening, any tap on the
  // screen ends the recording; only the mic itself starts it.
  captureMain.addEventListener("click", (e) => {
    if (listening && e.target !== micBtn && !micBtn.contains(e.target)) stopListening();
  });
}

// --- service worker (offline shell / home-screen access point) ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

window.blurtTracker = trackerStats;

renderRecent();
