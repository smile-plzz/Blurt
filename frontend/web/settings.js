// Settings (mockup screen 11). Persona summary + edit entry point, the one
// documented privacy exception (PRIVACY.md), and data export/delete. Nothing
// here is a live toggle yet - "Local-first: Always on" has no other state to
// switch to until the Privacy Agent's local-only-vs-cloud decision is
// revisited (see PRIVACY.md, CLAUDE.md's "Privacy" row).

// Labels for the ten-question onboarding flow's answers (onboarding.js's
// QUESTIONS array is the source of truth for the values themselves).
const STALL_LABELS = {
  starting: "stalls at starting",
  deciding: "stalls at deciding",
  finishing: "stalls at finishing",
  remembering: "stalls at remembering"
};

const FRAMING_LABELS = {
  direct: "prefers direct nudges",
  inquiring: "prefers being asked",
  "activation-only": "prefers a first-step nudge",
  "silent-recovery": "prefers no notifications"
};

function renderPersonaSummary() {
  const persona = loadPersona();
  const summaryEl = document.getElementById("persona-summary");
  const profile = persona?.onboarding_profile;
  if (!profile || (!profile.primary_stall_point && !profile.preferred_framing)) {
    summaryEl.textContent = "Persona not set up yet";
    return;
  }
  const parts = [
    STALL_LABELS[profile.primary_stall_point],
    FRAMING_LABELS[profile.preferred_framing]
  ].filter(Boolean);
  summaryEl.textContent = parts.length > 0 ? parts.join(" · ") : "Persona set up";
}
renderPersonaSummary();

document.getElementById("export-data").addEventListener("click", () => {
  const payload = {
    exported_at: new Date().toISOString(),
    intents: loadIntents(),
    persona: loadPersona()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blurt-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("delete-data").addEventListener("click", () => {
  if (!confirm("Delete everything on this device — captured intents and your persona? This can't be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PERSONA_KEY);
  localStorage.removeItem("blurt_onboarded_v1");
  localStorage.removeItem(LAST_OPEN_KEY);
  sessionStorage.removeItem("blurt_recovery_shown");
  window.location.href = "/frontend/web/onboarding.html";
});
