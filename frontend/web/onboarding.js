// Onboarding: Welcome -> ten questions across three passes -> optional voice
// prompt. Rebuilt 2026-08-11 against frontend/mockups/Blurt Onboarding
// Question Flow.dc.html, which supersedes the earlier single-screen
// subtype/window/gap quick-questions design. Key decisions from that spec,
// carried into this implementation:
//   - Not a diagnosis: no subtype question. adhd_subtype stays "unspecified".
//   - One question per screen, single pill choice, immediate advance on tap
//     (lower friction than a separate "continue" tap per question).
//   - Quiet segmented progress bar, never a "question N of 10" counter -
//     visible remaining count is the same pressure mechanic as an overdue
//     badge (roadmap's zero-guilt principle again, here for onboarding).
//   - Plain "Skip" on every question, not "prefer not to say".
//   - Q1 (entry_state) can end onboarding early after Q3 if the user is
//     overwhelmed - nobody in that state should be made to finish a form.
//   - Voice prompt moved to the end (after Q10), framed as optional.
//   - Q7 (gap_baseline_days) is the one answer that can't be inferred from
//     behavior later, so it's the one question this file never lets branch
//     past unanswered via the Q1 exit (that exit only fires after Q3).

// QUESTIONS lives in questions.js (shared with review.js), loaded before this
// file.

const OVERWHELM_STATES = ["overwhelmed_full", "foggy"];

const stepWelcome = document.getElementById("step-welcome");
const stepQuestion = document.getElementById("step-question");
const stepGentleExit = document.getElementById("step-gentle-exit");
const stepVoice = document.getElementById("step-voice");

const progressEl = document.getElementById("question-progress");
const titleEl = document.getElementById("question-title");
const optionsEl = document.getElementById("question-options");
const nextBtn = document.getElementById("question-next");
const skipBtn = document.getElementById("question-skip");

let answers = {};
let questionIndex = 0;
let selectedValue; // pending selection for the question on screen, not yet committed

function showStep(el) {
  for (const step of [stepWelcome, stepQuestion, stepGentleExit, stepVoice]) step.hidden = step !== el;
}

function renderProgress() {
  progressEl.innerHTML = "";
  QUESTIONS.forEach((_, i) => {
    const seg = document.createElement("div");
    seg.className = "onboard-progress-seg" + (i <= questionIndex ? " filled" : "");
    progressEl.appendChild(seg);
  });
}

function renderQuestion() {
  const q = QUESTIONS[questionIndex];
  renderProgress();
  titleEl.textContent = q.title;
  optionsEl.innerHTML = "";
  selectedValue = undefined;
  nextBtn.disabled = true;

  for (const opt of q.options) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "onboard-pill";
    pill.textContent = opt.label;
    pill.addEventListener("click", () => {
      selectedValue = opt.value;
      nextBtn.disabled = false;
      for (const el of optionsEl.children) el.classList.remove("selected");
      pill.classList.add("selected");
    });
    optionsEl.appendChild(pill);
  }
  showStep(stepQuestion);
}

nextBtn.addEventListener("click", () => {
  if (selectedValue === undefined) return;
  const q = QUESTIONS[questionIndex];
  answers[q.id] = q.array ? [selectedValue] : selectedValue;
  advance();
});

skipBtn.addEventListener("click", () => advance());

function advance() {
  const q = QUESTIONS[questionIndex];
  // Q3 is index 2 - the end of Pass 1. Branch here, not on every question,
  // per the spec: "Q1 can end onboarding early [after Q3]."
  if (q.id === "intent_surface_moments" && OVERWHELM_STATES.includes(answers.entry_state)) {
    persistPartialAndExit();
    return;
  }
  questionIndex += 1;
  if (questionIndex >= QUESTIONS.length) {
    showStep(stepVoice);
  } else {
    renderQuestion();
  }
}

function buildOnboardingProfile(voiceTranscript) {
  return {
    adhd_subtype: "unspecified",
    entry_state: answers.entry_state ?? null,
    typical_intent_class: answers.typical_intent_class ?? null,
    intent_surface_moments: answers.intent_surface_moments ?? [],
    primary_stall_point: answers.primary_stall_point ?? null,
    avoidance_driver: answers.avoidance_driver ?? null,
    energy_windows: answers.energy_windows ?? null,
    gap_baseline_days: answers.gap_baseline_days ?? null,
    preferred_framing: answers.preferred_framing ?? null,
    drop_prone_domains: answers.drop_prone_domains ?? [],
    stated_goal: answers.stated_goal ?? null,
    mc_answers: {},
    voice_transcript_analysis: voiceTranscript || null
  };
}

function persistPartialAndExit() {
  const persona = loadPersona() || emptyPersona();
  persona.onboarding_profile = buildOnboardingProfile(null);
  savePersona(persona);
  markOnboarded();
  showStep(stepGentleExit);
}

document.getElementById("gentle-exit-continue").addEventListener("click", () => {
  window.location.href = "/capture/web/";
});

function finishOnboarding(voiceTranscript) {
  const persona = loadPersona() || emptyPersona();
  persona.onboarding_profile = buildOnboardingProfile(voiceTranscript);
  savePersona(persona);
  markOnboarded();
  window.location.href = "/frontend/web/";
}

// --- entry points ---
document.getElementById("get-started").addEventListener("click", () => {
  questionIndex = 0;
  answers = {};
  renderQuestion();
});

document.getElementById("skip-onboarding").addEventListener("click", () => {
  markOnboarded();
  window.location.href = "/frontend/web/";
});

// --- voice prompt (final step) ---
const voiceToggle = document.getElementById("voice-toggle");
const voiceStatus = document.getElementById("voice-status");
const voiceFallback = document.getElementById("voice-fallback");
const pulse1 = document.getElementById("pulse-1");
const pulse2 = document.getElementById("pulse-2");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let transcript = "";

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.addEventListener("result", (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += (transcript ? " " : "") + e.results[i][0].transcript;
    }
  });

  recognition.addEventListener("end", () => {
    if (listening) recognition.start(); // browsers auto-stop after a pause; keep going until the user says done
  });

  recognition.addEventListener("error", (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      listening = false;
      voiceStatus.textContent = "mic blocked — type it instead.";
      setListeningUI(false);
    }
  });

  voiceToggle.addEventListener("click", () => {
    if (listening) return;
    listening = true;
    voiceStatus.textContent = "Listening…";
    setListeningUI(true);
    recognition.start();
  });
} else {
  voiceStatus.textContent = "Voice not supported here — type it instead.";
  voiceToggle.disabled = true;
}

function setListeningUI(isListening) {
  pulse1.hidden = !isListening;
  pulse2.hidden = !isListening;
  voiceToggle.classList.toggle("listening", isListening);
}

function stopListening() {
  if (listening && recognition) {
    listening = false; // set before .stop() so the "end" handler above doesn't restart it
    recognition.stop();
  }
  setListeningUI(false);
}

document.getElementById("voice-done").addEventListener("click", () => {
  stopListening();
  const text = (transcript + " " + voiceFallback.value).trim();
  finishOnboarding(text || null);
});

document.getElementById("voice-skip").addEventListener("click", () => {
  stopListening();
  finishOnboarding(voiceFallback.value.trim() || null);
});
