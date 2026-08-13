// Resumable persona edit (mockup screens 15-17, replacing Settings' old
// "Edit" link which restarted the ten-question onboarding flow from scratch -
// a documented open item in ROADMAP.md). Entry point is a list of what was
// already answered, not question one; editing one question never touches the
// other nine.

const stepList = document.getElementById("step-list");
const stepEdit = document.getElementById("step-edit");
const stepSaved = document.getElementById("step-saved");

const listEl = document.getElementById("review-list");
const editTitleEl = document.getElementById("edit-title");
const editOptionsEl = document.getElementById("edit-options");

function showStep(el) {
  for (const step of [stepList, stepEdit, stepSaved]) step.hidden = step !== el;
}

function currentProfile() {
  const persona = loadPersona();
  return persona?.onboarding_profile || null;
}

// Array-type questions (intent_surface_moments, drop_prone_domains) store a
// list of values; everything else stores one. Either way, render the
// label(s) a human would recognize, not the raw stored value.
function answerLabel(question, value) {
  if (value == null || (Array.isArray(value) && value.length === 0)) return null;
  const values = Array.isArray(value) ? value : [value];
  const labels = values
    .map((v) => question.options.find((o) => o.value === v)?.label)
    .filter(Boolean)
    .map((label) => label.split(" — ")[0].trim());
  return labels.length > 0 ? labels.join(", ") : null;
}

let selectedQuestionId = null;

function renderList() {
  const profile = currentProfile();
  listEl.innerHTML = "";
  for (const q of QUESTIONS) {
    const row = document.createElement("div");
    row.className = "card elev-sm";
    row.style.cssText = "padding:16px;flex-direction:row;align-items:center;gap:12px;cursor:pointer";

    const body = document.createElement("div");
    body.style.flex = "1";
    const label = document.createElement("div");
    label.style.cssText = "font-size:12px;opacity:.5;margin-bottom:4px";
    label.textContent = q.title.replace(/\?$/, "");
    body.appendChild(label);
    const value = document.createElement("div");
    value.style.fontSize = "15px";
    const answered = profile ? answerLabel(q, profile[q.id]) : null;
    value.textContent = answered || "Not answered";
    if (!answered) value.style.opacity = ".5";
    body.appendChild(value);
    row.appendChild(body);

    const chevron = document.createElement("span");
    chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" style="opacity:.35"><polyline points="9 18 15 12 9 6"/></svg>';
    row.appendChild(chevron);

    row.addEventListener("click", () => openEdit(q.id));
    listEl.appendChild(row);
  }
  showStep(stepList);
}

function openEdit(questionId) {
  selectedQuestionId = questionId;
  const q = QUESTIONS.find((question) => question.id === questionId);
  const profile = currentProfile();
  const current = profile ? profile[questionId] : null;
  const currentValues = Array.isArray(current) ? current : [current].filter((v) => v != null);

  editTitleEl.textContent = q.title;
  editOptionsEl.innerHTML = "";

  let pendingValue = q.array ? [...currentValues] : currentValues[0];

  function renderPills() {
    editOptionsEl.innerHTML = "";
    for (const opt of q.options) {
      const isSelected = q.array ? pendingValue.includes(opt.value) : pendingValue === opt.value;
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "onboard-pill" + (isSelected ? " selected" : "");
      pill.style.display = "flex";
      pill.style.alignItems = "center";
      pill.style.gap = "10px";

      const label = document.createElement("span");
      label.style.flex = "1";
      label.textContent = opt.label;
      pill.appendChild(label);

      if (isSelected) {
        const check = document.createElement("span");
        check.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        pill.appendChild(check);
      }

      pill.addEventListener("click", () => {
        if (q.array) {
          pendingValue = pendingValue.includes(opt.value)
            ? pendingValue.filter((v) => v !== opt.value)
            : [...pendingValue, opt.value];
        } else {
          pendingValue = opt.value;
        }
        renderPills();
      });
      editOptionsEl.appendChild(pill);
    }
  }
  renderPills();

  const saveBtn = document.getElementById("edit-save");
  const newSaveBtn = saveBtn.cloneNode(true); // drop any listener from a prior question
  saveBtn.replaceWith(newSaveBtn);
  newSaveBtn.addEventListener("click", () => {
    const persona = loadPersona() || emptyPersona();
    if (!persona.onboarding_profile) persona.onboarding_profile = { adhd_subtype: "unspecified", mc_answers: {}, voice_transcript_analysis: null };
    const before = answerLabel(q, persona.onboarding_profile[questionId]) || "Not answered";
    persona.onboarding_profile[questionId] = pendingValue;
    savePersona(persona);
    showSaved(q, before);
  });

  showStep(stepEdit);
}

function showSaved(q, before) {
  const after = answerLabel(q, currentProfile()[q.id]) || "Not answered";
  document.getElementById("saved-title").textContent = q.title.replace(/\?$/, "");
  document.getElementById("saved-change").textContent = `${before} → ${after}`;
  showStep(stepSaved);
}

document.getElementById("edit-back").addEventListener("click", renderList);
document.getElementById("edit-cancel").addEventListener("click", renderList);
document.getElementById("saved-done").addEventListener("click", renderList);

// "Walk through all ten" (mockup screen 15's ghost button): opens the first
// question rather than re-running the whole onboarding flow. Each question
// still edits and saves independently - this is a shortcut into the same
// per-question flow above, not a separate sequential mode.
document.getElementById("review-walkthrough").addEventListener("click", () => openEdit(QUESTIONS[0].id));

renderList();
