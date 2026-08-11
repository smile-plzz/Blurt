// Settings (mockup screen 11). Persona summary + edit entry point, the one
// documented privacy exception (PRIVACY.md), and data export/delete. Nothing
// here is a live toggle yet - "Local-first: Always on" has no other state to
// switch to until the Privacy Agent's local-only-vs-cloud decision is
// revisited (see PRIVACY.md, CLAUDE.md's "Privacy" row).

// Labels for the ten-question onboarding flow's answers (onboarding.js's
// QUESTIONS array is the source of truth for the values themselves). Mockup
// screen 14: a bold primary line ("Stalls at deciding") plus a muted
// secondary line combining the gap baseline and framing preference
// ("checks in every few days · asks directly").
const STALL_LABELS = {
  starting: "Stalls at starting",
  deciding: "Stalls at deciding",
  finishing: "Stalls at finishing",
  remembering: "Stalls at remembering"
};

const GAP_LABELS = {
  1: "checks in most days",
  4: "checks in every few days",
  14: "checks in every couple of weeks",
  10: "doesn't keep a regular check-in"
};

const FRAMING_LABELS = {
  direct: "asks directly",
  inquiring: "asks first",
  "activation-only": "nudges with a first step",
  "silent-recovery": "stays quiet until you're back"
};

function renderPersonaSummary() {
  const persona = loadPersona();
  const summaryEl = document.getElementById("persona-summary");
  const detailEl = document.getElementById("persona-detail");
  const profile = persona?.onboarding_profile;

  const primary = profile && STALL_LABELS[profile.primary_stall_point];
  summaryEl.textContent = primary || "Persona not set up yet";

  const detail = [
    profile && GAP_LABELS[profile.gap_baseline_days],
    profile && FRAMING_LABELS[profile.preferred_framing]
  ].filter(Boolean);
  detailEl.textContent = detail.join(" · ");
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
