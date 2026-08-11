// Task detail (mockup screen 13, new in the 2026-08-11 refined mockup pass).
// Implements decomposition decision #8 (deadline-confirmation prompt, never
// built until now) and the parent-level archive action (decision #7: parent
// and subtasks resolve fully independently - archiving works with subtasks
// still open). Reached from the home feed by tapping a decomposed parent,
// replacing the older simpler in-modal per-parent rollup.

const params = new URLSearchParams(location.search);
const parentId = params.get("id");

const titleEl = document.getElementById("task-title");
const metaEl = document.getElementById("task-meta");
const mainEl = document.getElementById("task-main");
const archiveBtn = document.getElementById("task-archive");

function daysAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return "captured today";
  if (days === 1) return "captured yesterday";
  return `captured ${days} days ago`;
}

function weekdayTag(iso) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
}

function render() {
  const allIntents = loadIntents();
  const parent = findIntent(allIntents, parentId);
  if (!parent) {
    mainEl.innerHTML = '<p style="padding:20px 24px;opacity:.6">This task no longer exists.</p>';
    archiveBtn.hidden = true;
    return;
  }

  const subtasks = parent.subtasks.map((id) => findIntent(allIntents, id)).filter(Boolean);
  const open = subtasks.filter((s) => s.state !== "resolved" && s.state !== "dropped");
  const closed = subtasks.filter((s) => s.state === "resolved" || s.state === "dropped");
  const withDate = open.filter((s) => s.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const noDate = open.filter((s) => !s.deadline);

  titleEl.textContent = parent.text;
  metaEl.textContent = `${daysAgo(parent.captured_at)} · ${open.length} step${open.length === 1 ? "" : "s"} open`;

  mainEl.innerHTML = "";

  if (withDate.length > 0) {
    const focusedId = withDate.some((s) => s.id === focusedOverride) ? focusedOverride : withDate[0].id;
    mainEl.appendChild(renderGroup("Has a date", withDate.map((item) => renderDatedRow(item, item.id === focusedId))));
  }

  if (noDate.length > 0) {
    // Decision #8: ask once per subtask whether a deadline exists. Only the
    // first not-yet-asked item gets the expanded prompt - asking all of them
    // at once would be exactly the backlog-dump pattern this app avoids
    // elsewhere (Recovery Mode, the rollup). Already-answered items are
    // plain, non-interactive rows - there's nothing left to ask them.
    const unasked = noDate.find((s) => !s.deadline_confirmed_absent);
    mainEl.appendChild(
      renderGroup(
        "No date — even footing",
        noDate.map((item) => renderNoDateRow(item, unasked ? item.id === unasked.id : false))
      )
    );
  }

  if (closed.length > 0) {
    mainEl.appendChild(renderGroup("Closed", closed.map(renderClosedRow)));
  }

  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-ghost subtask-add";
  addBtn.textContent = "+ Add a step";
  addBtn.addEventListener("click", () => renderAddStepRow(addBtn));
  mainEl.appendChild(addBtn);
}

function renderGroup(label, rows) {
  const group = document.createElement("div");
  group.className = "task-group";
  const p = document.createElement("p");
  p.className = "rollup-group-label";
  p.textContent = label;
  group.appendChild(p);
  const list = document.createElement("div");
  list.className = "task-group-rows";
  for (const row of rows) list.appendChild(row);
  group.appendChild(list);
  return group;
}

function plainRow(item, tagText, tagClass) {
  const row = document.createElement("div");
  row.className = "card elev-sm task-row";
  const dot = document.createElement("div");
  dot.className = "task-dot";
  row.appendChild(dot);
  const label = document.createElement("span");
  label.className = "task-row-text";
  label.textContent = item.text;
  row.appendChild(label);
  if (tagText) {
    const tag = document.createElement("span");
    tag.className = "tag " + tagClass;
    tag.textContent = tagText;
    row.appendChild(tag);
  }
  return row;
}

function renderDatedRow(item, focused) {
  if (!focused) {
    const row = plainRow(item, weekdayTag(item.deadline), "tag-outline");
    row.addEventListener("click", () => { focusedOverride = item.id; render(); });
    return row;
  }

  const card = document.createElement("div");
  card.className = "card elev-sm task-focused-card";

  const top = document.createElement("div");
  top.className = "task-row";
  const dot = document.createElement("div");
  dot.className = "task-dot task-dot-accent";
  top.appendChild(dot);
  const label = document.createElement("span");
  label.className = "task-row-text";
  label.textContent = item.text;
  top.appendChild(label);
  const tag = document.createElement("span");
  tag.className = "tag tag-accent";
  tag.textContent = weekdayTag(item.deadline);
  top.appendChild(tag);
  card.appendChild(top);

  const hint = document.createElement("p");
  hint.className = "task-hint";
  hint.textContent = item.stall_count > 0
    ? `Stalled ${item.stall_count === 1 ? "once" : item.stall_count + " times"}. Start with the smallest next step.`
    : "Coming up soon.";
  card.appendChild(hint);

  const actions = document.createElement("div");
  actions.className = "task-focused-actions";
  const doneish = document.createElement("button");
  doneish.className = "btn btn-primary";
  doneish.style.flex = "1";
  doneish.style.height = "44px";
  doneish.style.fontSize = "14px";
  doneish.textContent = "Just that bit";
  doneish.addEventListener("click", () => mutate(item.id, (i) => stall(i)));
  actions.appendChild(doneish);
  const letGo = document.createElement("button");
  letGo.className = "btn btn-ghost";
  letGo.style.flex = "1";
  letGo.style.height = "44px";
  letGo.style.fontSize = "14px";
  letGo.textContent = "Let it go";
  letGo.addEventListener("click", () => mutate(item.id, (i) => resolve(i, "no_longer_relevant")));
  actions.appendChild(letGo);
  card.appendChild(actions);

  return card;
}

function renderNoDateRow(item, focused) {
  if (!focused) {
    // No click-to-expand here: an already-confirmed-absent item has nothing
    // left to ask, unlike the "Has a date" group's plain rows.
    return plainRow(item, item.state !== "dormant" ? item.state : null, tagClassForState(item.state));
  }

  const card = document.createElement("div");
  card.className = "card elev-sm task-focused-card task-focused-card-neutral";

  const top = document.createElement("div");
  top.className = "task-row";
  const dot = document.createElement("div");
  dot.className = "task-dot";
  top.appendChild(dot);
  const label = document.createElement("span");
  label.className = "task-row-text";
  label.textContent = item.text;
  top.appendChild(label);
  card.appendChild(top);

  const hint = document.createElement("p");
  hint.className = "task-hint";
  hint.textContent = "Is there a date this needs to happen by?";
  card.appendChild(hint);

  const actions = document.createElement("div");
  actions.className = "task-focused-actions";

  const pickBtn = document.createElement("button");
  pickBtn.className = "btn btn-secondary";
  pickBtn.style.flex = "1";
  pickBtn.style.height = "44px";
  pickBtn.style.fontSize = "14px";
  pickBtn.textContent = "Pick a date";
  pickBtn.addEventListener("click", () => revealDatePicker(card, item.id));
  actions.appendChild(pickBtn);

  const noneBtn = document.createElement("button");
  noneBtn.className = "btn btn-ghost";
  noneBtn.style.flex = "1";
  noneBtn.style.height = "44px";
  noneBtn.style.fontSize = "14px";
  noneBtn.textContent = "There isn't one";
  noneBtn.addEventListener("click", () => mutate(item.id, (i) => { i.deadline_confirmed_absent = true; }));
  actions.appendChild(noneBtn);

  card.appendChild(actions);
  return card;
}

function revealDatePicker(card, itemId) {
  if (card.querySelector(".task-date-picker")) return;
  const wrap = document.createElement("div");
  wrap.className = "task-date-picker";
  const input = document.createElement("input");
  input.type = "date";
  input.className = "input";
  wrap.appendChild(input);
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "btn btn-primary";
  confirmBtn.textContent = "Set";
  confirmBtn.addEventListener("click", () => {
    if (!input.value) return;
    mutate(itemId, (i) => { i.deadline = new Date(input.value).toISOString(); });
  });
  wrap.appendChild(confirmBtn);
  card.appendChild(wrap);
}

function renderClosedRow(item) {
  const row = document.createElement("div");
  row.className = "card elev-sm task-row task-row-closed";
  const dot = document.createElement("div");
  dot.className = "task-dot" + (item.state === "resolved" ? " task-dot-done" : "");
  if (item.state === "resolved") {
    dot.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  }
  row.appendChild(dot);
  const label = document.createElement("span");
  label.className = "task-row-text";
  if (item.state === "resolved") label.style.textDecoration = "line-through";
  label.textContent = item.text;
  row.appendChild(label);
  if (item.state === "dropped") {
    const tag = document.createElement("span");
    tag.className = "tag tag-neutral";
    tag.textContent = "let go";
    row.appendChild(tag);
  }
  return row;
}

function renderAddStepRow(addBtn) {
  const row = document.createElement("div");
  row.className = "card elev-sm subtask-row";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "subtask-text";
  input.placeholder = "New step";
  row.appendChild(input);
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "btn btn-icon";
  confirmBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  confirmBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) return;
    const current = loadIntents();
    const parent = findIntent(current, parentId);
    const sub = newIntent(text, "typed_fallback");
    sub.parent_intent_id = parentId;
    current.push(sub);
    parent.subtasks.push(sub.id);
    saveIntents(current);
    render();
  });
  row.appendChild(confirmBtn);
  addBtn.replaceWith(row);
  input.focus();
}

// focusedOverride: lets tapping any plain row promote it to the expanded
// card, in place of whichever item would otherwise be auto-focused.
let focusedOverride = null;

function mutate(itemId, effect) {
  const current = loadIntents();
  const target = findIntent(current, itemId);
  if (target) {
    effect(target);
    if (target.state_updated_at !== undefined) target.state_updated_at = new Date().toISOString();
    saveIntents(current);
  }
  focusedOverride = null;
  render();
}

archiveBtn.addEventListener("click", () => {
  const current = loadIntents();
  const parent = findIntent(current, parentId);
  if (parent) {
    resolve(parent, "no_longer_relevant");
    saveIntents(current);
  }
  window.location.href = "/frontend/web/";
});

render();
