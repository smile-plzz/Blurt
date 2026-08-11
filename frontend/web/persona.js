// Shared persona.json-shaped storage helpers (schema/persona.json 0.1.0).
// Used by onboarding.js (writes onboarding_profile), recovery.js and app.js
// (read gap_baseline_hours / adhd_subtype), and settings.js (display + edit).
// No inference logic lives here - Persona Agent's inferred_patterns stays
// empty until step 4's persona layer is extended to write it.

const PERSONA_KEY = "blurt_persona_v0.1.0";
const LAST_OPEN_KEY = "blurt_last_open_v1";

function loadPersona() {
  try {
    return JSON.parse(localStorage.getItem(PERSONA_KEY));
  } catch {
    return null;
  }
}

function savePersona(persona) {
  localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
}

function hasCompletedOnboarding() {
  return localStorage.getItem("blurt_onboarded_v1") === "true";
}

function markOnboarded() {
  localStorage.setItem("blurt_onboarded_v1", "true");
}

function emptyPersona() {
  return {
    user_id: crypto.randomUUID(),
    onboarding_profile: {
      adhd_subtype: "unspecified",
      mc_answers: {},
      voice_transcript_analysis: null
    },
    interaction_log: [],
    inferred_patterns: {
      forget_triggers: [],
      best_reminder_windows: [],
      task_categories_prone_to_drop: [],
      confidence: {}
    },
    active_clarifications: []
  };
}
