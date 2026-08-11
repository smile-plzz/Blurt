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

const QUESTIONS = [
  {
    id: "entry_state",
    pass: "Pass 1 of 3",
    title: "How's your head right now?",
    options: [
      { label: "Pretty full — a lot going on", value: "overwhelmed_full" },
      { label: "Foggy — can't get a grip on anything", value: "foggy" },
      { label: "Flat — nothing feels worth starting", value: "flat" },
      { label: "Fine, mostly — here to get ahead of it", value: "fine_ahead_of_it" }
    ]
  },
  {
    id: "typical_intent_class",
    pass: "Pass 1 of 3",
    title: "What's a thing you've been meaning to do?",
    options: [
      { label: "Small and annoying (a call, a form, a chore)", value: "small_annoying" },
      { label: "Big and vague (a project, a move, a change)", value: "big_vague" },
      { label: "Something for someone else", value: "for_someone_else" },
      { label: "Honestly, a pile of all three", value: "mixed" }
    ]
  },
  {
    id: "intent_surface_moments",
    pass: "Pass 1 of 3",
    title: "When do you usually notice you meant to do something?",
    array: true,
    options: [
      { label: "Right as I'm falling asleep", value: "falling_asleep" },
      { label: "Mid-task, about something unrelated", value: "mid_task" },
      { label: "When someone reminds me", value: "reminded_by_someone" },
      { label: "Too late to do anything about it", value: "too_late" }
    ]
  },
  {
    id: "primary_stall_point",
    pass: "Pass 2 of 3",
    title: "Where do things usually stall for you?",
    options: [
      { label: "Starting — I know what it is, I just can't begin", value: "starting" },
      { label: "Deciding — I don't know which thing to do first", value: "deciding" },
      { label: "Finishing — I start plenty, I just drift off", value: "finishing" },
      { label: "Remembering — it's gone before I can act", value: "remembering" }
    ]
  },
  {
    id: "avoidance_driver",
    pass: "Pass 2 of 3",
    title: "When you've been avoiding something, what's usually behind it?",
    options: [
      { label: "It's boring, and I can't make myself care", value: "boredom" },
      { label: "It's bigger than it looks and I don't know where to start", value: "size" },
      { label: "I'm dreading it — something about it stings", value: "dread" },
      { label: "I keep thinking there'll be a better moment", value: "timing" }
    ]
  },
  {
    id: "energy_windows",
    pass: "Pass 2 of 3",
    title: "When in the day do you actually have something in the tank?",
    options: [
      { label: "Early — mornings are my good hours", value: "mornings" },
      { label: "Late — I come alive at night", value: "nights" },
      { label: "In bursts, unpredictably", value: "bursts" },
      { label: "Rarely — most days are a slog right now", value: "rarely" }
    ]
  },
  {
    id: "gap_baseline_days",
    pass: "Pass 2 of 3",
    title: "How long do you usually go before checking in on your own list?",
    // Section 3.4's exact gap-baseline question. Day counts are a coarse,
    // documented mapping from the four answer bands, not a precise self-report -
    // good enough for a Recovery Mode trigger before real history exists.
    options: [
      { label: "Most days", value: 1 },
      { label: "Every few days", value: 4 },
      { label: "Every couple of weeks, if that", value: 14 },
      { label: "I don't keep one — that's the problem", value: 10 }
    ]
  },
  {
    id: "preferred_framing",
    pass: "Pass 3 of 3",
    title: "A reminder lands and you haven't done the thing. What helps?",
    options: [
      { label: "Just say the thing. “Open the lecture.”", value: "direct" },
      { label: "Ask me. “Still on your mind, or can this go?”", value: "inquiring" },
      { label: "Give me the first inch, not the whole task", value: "activation-only" },
      { label: "Leave me alone and bring it up next time I'm here", value: "silent-recovery" }
    ]
  },
  {
    id: "drop_prone_domains",
    pass: "Pass 3 of 3",
    title: "Where does it fall apart most?",
    array: true,
    options: [
      { label: "Work or study things", value: "work_study" },
      { label: "Home and admin — bills, forms, appointments", value: "home_admin" },
      { label: "People — replies, plans, birthdays", value: "people" },
      { label: "Looking after myself", value: "self_care" },
      { label: "All of it, fairly evenly", value: "even" }
    ]
  },
  {
    id: "stated_goal",
    pass: "Pass 3 of 3",
    title: "What would make this worth keeping on your phone?",
    options: [
      { label: "Catching things before I lose them", value: "catching_things" },
      { label: "Actually finishing a few of them", value: "finishing_things" },
      { label: "Feeling less behind than I do now", value: "feeling_less_behind" },
      { label: "Getting one specific thing off my back", value: "one_specific_thing" }
    ]
  }
];

const OVERWHELM_STATES = ["overwhelmed_full", "foggy"];

const stepWelcome = document.getElementById("step-welcome");
const stepQuestion = document.getElementById("step-question");
const stepGentleExit = document.getElementById("step-gentle-exit");
const stepVoice = document.getElementById("step-voice");

const progressEl = document.getElementById("question-progress");
const passTagEl = document.getElementById("question-pass-tag");
const titleEl = document.getElementById("question-title");
const optionsEl = document.getElementById("question-options");
const skipBtn = document.getElementById("question-skip");

let answers = {};
let questionIndex = 0;

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
  passTagEl.textContent = q.pass;
  titleEl.textContent = q.title;
  optionsEl.innerHTML = "";
  for (const opt of q.options) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "onboard-pill";
    pill.textContent = opt.label;
    pill.addEventListener("click", () => {
      answers[q.id] = q.array ? [opt.value] : opt.value;
      advance();
    });
    optionsEl.appendChild(pill);
  }
  showStep(stepQuestion);
}

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
