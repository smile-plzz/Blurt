// Capture Agent: emits raw intent.json-shaped events. No analysis performed here by design.

const STORAGE_KEY = "blurt_intents_v0.1.0";

const micBtn = document.getElementById("mic-btn");
const micIcon = document.getElementById("mic-icon");
const statusEl = document.getElementById("status");
const typeForm = document.getElementById("type-form");
const typeInput = document.getElementById("type-input");
const toast = document.getElementById("toast");
const recentEl = document.getElementById("recent");

function loadIntents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
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
    category: null
  };

  const intents = loadIntents();
  intents.push(intent);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(intents));

  showToast("blurted.");
  renderRecent();
}

function showToast(message) {
  toast.textContent = message;
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

if (!SpeechRecognition) {
  micBtn.classList.add("unsupported");
  statusEl.textContent = "voice not supported here. type it instead.";
} else {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let listening = false;

  recognition.addEventListener("result", (e) => {
    const text = e.results[0][0].transcript;
    saveIntent(text, "voice");
  });

  recognition.addEventListener("end", () => {
    listening = false;
    micBtn.classList.remove("listening");
    statusEl.textContent = "tap. speak. done.";
  });

  recognition.addEventListener("error", (e) => {
    listening = false;
    micBtn.classList.remove("listening");
    if (e.error === "no-speech") {
      statusEl.textContent = "didn't catch that. tap to retry.";
    } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      statusEl.textContent = "mic blocked. type it instead.";
    } else {
      statusEl.textContent = "tap. speak. done.";
    }
  });

  micBtn.addEventListener("click", () => {
    if (listening) return;
    listening = true;
    micBtn.classList.add("listening");
    statusEl.textContent = "listening...";
    recognition.start();
  });
}

// --- service worker (offline shell / home-screen access point) ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

renderRecent();
