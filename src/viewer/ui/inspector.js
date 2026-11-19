// Inspector panel on the right: summary, table, field, relation and group details (editable in the target view).
import { CARDINALITIES, fieldRef } from "../../model/normalize.js";
import { TILE_DISPLAYS, UNASSIGNED } from "../../model/page-data.js";
import { countStatuses } from "../diff.js";
import { S } from "../strings.js";
import { chip, centerOn, fieldKeysText, fieldTypeText, indexDescription, indexText, relationLabel } from "./canvas.js";
import { addField, commit, moveField, renameEntity, renameField, select, setView, startGrouping } from "./actions.js";
import { view } from "./view.js";
import { esc, on, option } from "./html.js";
import { renderModulePanel } from "./module-view.js";
import {
  state, activeModel, axisKeys, axisLabel, axisOf, entityById, entityStatus, fieldStatus, hasTarget, indexesOf, isEditing, moduleOf, relationStatus, saveTileDisplays,
} from "./state.js";

const FLAGS = ["pk", "uk", "fk", "nullable", "list"];
let panel;

export function initInspector() { panel = document.getElementById("panel"); }

export function renderPanel() {
  if (state.moduleView) return renderModulePanel(panel);
  const s = state.sel;
  if (!s) return renderSummary();
  if (s.kind === "rel") return renderRelation(s.id);
  if (s.kind === "group") return renderGroup(s.id);
  if (s.kind === "field") return renderField(s.eid, s.fid);
  return renderEntity(s.id);
}

function bindBack() {
  on("p-back", "click", () => select(null));
  on("p-up", "click", () => select({ kind: "entity", id: state.sel.eid }));
}

function armed(id, label) {
  return state.confirm === id ? S.confirmAgain : label;
}
/** Two-click delete: the first click arms the button, the second runs the action. */
function bindDelete(buttonId, confirmId, action) {
  on(buttonId, "click", () => {
    if (state.confirm !== confirmId) { state.confirm = confirmId; renderPanel(); return; }
    state.confirm = null;
    action();
  });
}

function itemList(items) {
  return '<div class="items">' + items.map(i => '<div class="item" tabindex="0" data-id="' + esc(i.id) + '" data-view="' + i.view + '"><span class="nm' + (i.status === "removed" ? " strike" : "") + '">' + esc(i.name) + '</span><span class="meta">' + esc(i.meta || "") + " " + (i.status ? chip(i.status) : "") + "</span></div>").join("") + "</div>";
}

function bindItemNavigation() {
  panel.querySelectorAll(".item[data-view]").forEach(el => {
    const go = () => { if (state.view !== el.dataset.view) setView(el.dataset.view); select({ kind: "entity", id: el.dataset.id }); centerOn(el.dataset.id); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", ev => { if (ev.key === "Enter") go(); });
  });
}

function renderSummary() {
  let html;
  if (!hasTarget()) {
    html = "<section><h3>" + S.helpTitleViewer + '</h3><p class="muted">' + S.helpViewer + "</p></section>";
    const items = state.current.entities.map(e => ({ id: e.id, view: "current", name: e.name, meta: e.fields.length + "" }));
    html += "<section><h3>" + S.summaryTables + " (" + items.length + ")</h3>" + itemList(items) + "</section>";
    panel.innerHTML = html;
    bindItemNavigation();
    return;
  }
  const d = state.diff, edit = isEditing();
  const targetItems = statuses => state.target.entities.filter(e => statuses.includes(d.target.entities[e.id].status));
  const groups = [
    [S.summaryAdded, targetItems(["added"]).map(e => ({ id: e.id, view: "target", name: e.name, status: "added" }))],
    [S.summaryRenamed, targetItems(["renamed", "merged"]).map(e => ({ id: e.id, view: "target", name: e.name, status: d.target.entities[e.id].status, meta: "← " + d.target.entities[e.id].origin.join(" + ") }))],
    [S.summaryChanged, targetItems(["changed"]).map(e => ({ id: e.id, view: "target", name: e.name, status: "changed" }))],
    [S.summaryRemoved, state.current.entities.filter(e => d.current.entities[e.id].status === "removed").map(e => ({ id: e.id, view: "current", name: e.name, status: "removed" }))],
  ];
  html = "<section><h3>" + (edit ? S.helpTitleEdit : S.helpTitleCurrent) + '</h3><p class="muted">' + (edit ? S.helpEdit : S.helpCurrent) + "</p></section>";
  for (const [title, items] of groups) if (items.length) html += "<section><h3>" + title + " (" + items.length + ")</h3>" + itemList(items) + "</section>";
  const counts = countStatuses(d);
  const rel = { added: counts.targetRelations.added || 0, removed: counts.currentRelations.removed || 0, changed: counts.targetRelations.changed || 0 };
  html += "<section><h3>" + S.summaryRelations + '</h3><p class="muted">' + S.summaryRelationText(rel.added, rel.removed, rel.changed) + "</p></section>";
  if (d.unresolvedOrigins.length) {
    html += '<section class="warn"><h3>' + S.unresolvedTitle + '</h3><p class="muted">' + S.unresolvedText + '</p><div class="items">' +
      d.unresolvedOrigins.map(u => '<div class="item"><span class="nm">' + esc(u.where) + '</span><span class="meta">' + esc(u.ref) + "</span></div>").join("") + "</div></section>";
  }
  panel.innerHTML = html;
  bindItemNavigation();
}

// "" = drawn as lines; otherwise one of TILE_DISPLAYS. A per-viewer preference, so it is offered in every view.
function tileDisplayHtml(e) {
  const current = state.tileDisplays.get(e.name) || "";
  const labels = { tile: S.tileToggle, badge: S.tileDisplayBadge };
  return '<label title="' + esc(S.tileToggleTitle) + '">' + S.tileDisplay + '<select id="p-tile">' + option("", S.tileDisplayLine, current === "") +
    TILE_DISPLAYS.map(d => option(d, labels[d], current === d)).join("") + "</select></label>";
}

function configNoteHtml(e) {
  const note = state.page.config.notes[e.name];
  return note ? '<div class="note" title="' + esc(S.configNote) + '">' + esc(note) + "</div>" : "";
}

// Texts of the editable classification axes; the property on the entity is the axis name.
const AXIS_TEXTS = {
  kind: () => ({ label: S.dataKind, automatic: S.kindAutomatic, none: S.kindExplicitNone }),
  module: () => ({ label: S.module, automatic: S.moduleAutomatic, none: S.moduleExplicitNone }),
};

function axisSelectHtml(axisName, e) {
  if (!axisKeys(axisName).length) return "";
  const texts = AXIS_TEXTS[axisName](), automatic = axisOf(axisName, e, { ignoreOwn: true });
  const value = e[axisName] || "";
  return '<label>' + texts.label + '<select id="p-' + axisName + '">' + option("", texts.automatic(automatic ? axisLabel(axisName, automatic) : texts.none), value === "") +
    axisKeys(axisName).map(k => option(k, axisLabel(axisName, k), value === k)).join("") + option(UNASSIGNED, texts.none, value === UNASSIGNED) + "</select></label>";
}

function moduleLineHtml(e) {
  if (!axisKeys("module").length) return "";
  const key = moduleOf(e);
  return '<span class="muted">' + esc(S.moduleOfTable(key ? axisLabel("module", key) : S.moduleNone)) + "</span>";
}

function renderEntity(id) {
  const edit = isEditing(), model = activeModel();
  const e = entityById(id);
  if (!e) { state.sel = null; return renderSummary(); }
  const st = entityStatus(e);
  let html = '<section><button class="linkbtn" id="p-back" type="button">' + (hasTarget() ? S.backToSummary : S.backToTables) + "</button>";
  if (edit) {
    html += "<label>" + S.tableName + '<input type="text" class="mono" id="p-name" value="' + esc(e.name) + '"></label>';
    const fromOther = st.origin.length && !(st.origin.length === 1 && st.origin[0] === e.name);
    html += '<div class="row">' + chip(st.status) + (fromOther ? '<span class="muted">' + esc(S.fromOrigins(st.origin.join(" + "))) + "</span>" : "") + "</div>";
    html += axisSelectHtml("kind", e) + axisSelectHtml("module", e);
    html += "<label>" + S.note + '<textarea id="p-note">' + esc(e.note || "") + "</textarea></label>";
  } else {
    html += '<div class="row"><h2>' + esc(e.name) + "</h2>" + (st ? chip(st.status) : "") + "</div>";
    if (st && st.to && st.to.length && !st.to.includes(e.name)) html += '<span class="muted">' + esc(S.becomes(st.to.join(", "))) + "</span>";
    html += moduleLineHtml(e);
    if (e.note) html += '<div class="note">' + esc(e.note) + "</div>";
    const successor = st && st.to && state.target.entities.find(t => st.to.includes(t.name) && t.note);
    if (successor) html += '<div class="note">' + esc(successor.name + ": " + successor.note) + "</div>";
  }
  html += configNoteHtml(e) + tileDisplayHtml(e) + "</section>";

  html += "<section><h3>" + S.fields + '</h3><div class="items">';
  for (const f of e.fields) {
    const fs = fieldStatus(f);
    let meta = "";
    if (state.diff && edit && f.origin && f.origin.length && fs !== "same" && fs !== "changed") meta = "← " + f.origin.map(o => (o.startsWith(e.name + ".") ? o.slice(e.name.length + 1) : o)).join(", ");
    if (state.diff && !edit) { const to = state.diff.current.fields[f.id].to; if (to.length && fs !== "same" && fs !== "changed") meta = "→ " + to.join(", "); }
    html += '<div class="item" tabindex="0" data-fid="' + esc(f.id) + '"><span class="nm' + (fs === "removed" ? " strike" : "") + '">' + esc(f.name) + '</span><span class="meta">' + esc(meta) + " " + (state.diff ? chip(fs) : '<span class="mono">' + esc(fieldTypeText(f)) + "</span>") + "</span></div>";
  }
  html += "</div>" + (edit ? '<button class="btn" id="p-addf" type="button">' + S.addField + "</button>" : "") + "</section>";
  const indexes = indexesOf(e, model);
  html += "<section><h3>" + S.indexes + "</h3>" + (indexes.length
    ? '<div class="items">' + indexes.map(i => '<div class="item"><span class="nm mono">' + (i.unique ? S.indexUnique : S.indexPlain) + " " + esc(indexText(i)) + '</span><span class="meta">' + esc(indexDescription(i)) + "</span></div>").join("") + "</div>"
    : '<p class="muted">' + S.indexesEmpty + "</p>") + "</section>";

  if (edit) {
    const lost = [];
    for (const name of st.origin) {
      const before = state.current.entities.find(x => x.name === name);
      for (const f of before.fields) {
        const fs = state.diff.current.fields[f.id];
        if (fs.status === "removed" || fs.status === "moved") lost.push({ ref: fieldRef(name, f.name), fs });
      }
    }
    if (lost.length) html += "<section><h3>" + S.lostHere + '</h3><div class="items">' + lost.map(l => '<div class="item"><span class="nm strike">' + esc(l.ref) + '</span><span class="meta">' + (l.fs.to.length ? "→ " + esc(l.fs.to.join(", ")) + " " : "") + chip(l.fs.status) + "</span></div>").join("") + "</div></section>";
    const declared = e.origin === undefined ? st.origin : e.origin;
    html += "<section><h3>" + S.replaces + '</h3><p class="muted">' + S.replacesHelp + '</p><div class="checklist">' +
      state.current.entities.map(c => '<label><input type="checkbox" data-origin="' + esc(c.name) + '"' + (declared.includes(c.name) ? " checked" : "") + "> " + esc(c.name) + "</label>").join("") + "</div></section>";
    html += '<section><button class="btn danger" id="p-del" type="button">' + armed("del-ent", S.deleteTable) + "</button></section>";
  }
  panel.innerHTML = html;
  bindBack();
  on("p-tile", "change", display => {
    if (display) state.tileDisplays.set(e.name, display); else state.tileDisplays.delete(e.name);
    saveTileDisplays();
    view.renderChrome();
    view.renderCanvas();
  });
  panel.querySelectorAll(".item[data-fid]").forEach(el => {
    const go = () => select({ kind: "field", eid: e.id, fid: el.dataset.fid });
    el.addEventListener("click", go);
    el.addEventListener("keydown", ev => { if (ev.key === "Enter") go(); });
  });
  if (!edit) return;
  const update = fn => commit(s => fn(entityById(e.id, s.target)));
  on("p-name", "change", v => renameEntity(e.id, v));
  on("p-note", "change", v => update(t => { if (v) t.note = v; else delete t.note; }));
  for (const axisName of Object.keys(AXIS_TEXTS)) on("p-" + axisName, "change", v => update(t => { if (v) t[axisName] = v; else delete t[axisName]; }));
  on("p-addf", "click", () => addField(e.id));
  panel.querySelectorAll("input[data-origin]").forEach(cb => cb.addEventListener("change", () => update(t => {
    const set = new Set(t.origin === undefined ? st.origin : t.origin);
    if (cb.checked) set.add(cb.dataset.origin); else set.delete(cb.dataset.origin);
    t.origin = [...set];
  })));
  bindDelete("p-del", "del-ent", () => {
    state.sel = null;
    commit(s => { s.target.entities = s.target.entities.filter(x => x.id !== e.id); });
  });
}

function currentFieldOptions(selected) {
  let html = option("", S.originAdd, true);
  for (const e of state.current.entities) {
    html += '<optgroup label="' + esc(e.name) + '">' + e.fields.map(f => { const ref = fieldRef(e.name, f.name); return option(ref, ref, false, selected.includes(ref)); }).join("") + "</optgroup>";
  }
  return html;
}

function renderField(eid, fid) {
  const edit = isEditing();
  const e = entityById(eid);
  const f = e && e.fields.find(x => x.id === fid);
  if (!f) { state.sel = e ? { kind: "entity", id: e.id } : null; return renderPanel(); }
  const fs = fieldStatus(f);
  let html = '<section><button class="linkbtn" id="p-up" type="button">← ' + esc(e.name) + "</button>";
  if (!edit) {
    html += '<div class="row"><h2 class="mono">' + esc(f.name) + "</h2>" + (state.diff ? chip(fs) : "") + "</div>";
    html += '<span class="muted mono">' + esc(fieldTypeText(f)) + (fieldKeysText(f) ? " · " + esc(fieldKeysText(f)) : "") + (f.default !== undefined ? " = " + esc(f.default) : "") + "</span>";
    if (f.note) html += '<div class="note">' + esc(f.note) + "</div>";
    if (state.diff && state.diff.current.fields[f.id].to.length) html += '<span class="muted">' + esc(S.inTarget(state.diff.current.fields[f.id].to.join(", "))) + "</span>";
    panel.innerHTML = html + "</section>";
    bindBack();
    return;
  }
  const declared = f.origin === undefined ? [] : f.origin;
  const types = [...new Set([...state.current.entities, ...state.target.entities].flatMap(x => x.fields.map(y => y.type)))].sort();
  html += '<div class="row">' + chip(fs) + "</div>";
  html += "<label>" + S.fieldName + '<input type="text" class="mono" id="p-name" value="' + esc(f.name) + '"></label>';
  html += "<label>" + S.fieldType + '<input type="text" class="mono" id="p-type" value="' + esc(f.type) + '" list="typelist"></label>';
  html += '<div class="checks">' + FLAGS.map(k => '<label><input type="checkbox" data-flag="' + k + '"' + (f[k] ? " checked" : "") + "> " + S.fieldFlags[k] + "</label>").join("") + "</div>";
  html += '<div class="checks"><label title="' + esc(S.fieldChangedTitle) + '"><input type="checkbox" id="p-changed"' + (f.changed ? " checked" : "") + "> " + S.fieldChanged + "</label></div>";
  html += "<label>" + S.fieldDefault + '<input type="text" class="mono" id="p-default" value="' + esc(f.default === undefined ? "" : f.default) + '"></label>';
  html += "<label>" + S.note + '<input type="text" id="p-note" value="' + esc(f.note || "") + '"></label>';
  html += "</section>";
  html += "<section><h3>" + S.originTitle + '</h3><p class="muted">' + S.originHelp + '</p><div class="origins">' +
    declared.map(o => '<div class="origin"><span>' + esc(o) + '</span><button type="button" data-rm="' + esc(o) + '" aria-label="' + esc(S.originRemove) + '">×</button></div>').join("") +
    '</div><select id="p-origin">' + currentFieldOptions(declared) + "</select></section>";
  html += "<section><label>" + S.moveField + '<select id="p-move">' + option("", S.moveFieldPick, true) +
    state.target.entities.filter(x => x.id !== e.id).map(x => option(x.id, x.name, false)).join("") + "</select></label>";
  html += '<button class="btn danger" id="p-del" type="button">' + armed("del-field", S.deleteField) + "</button></section>";
  html += '<datalist id="typelist">' + types.map(t => '<option value="' + esc(t) + '">').join("") + "</datalist>";
  panel.innerHTML = html;
  bindBack();
  const update = fn => commit(s => fn(entityById(e.id, s.target).fields.find(x => x.id === f.id)));
  on("p-name", "change", v => renameField(e.id, f.id, v));
  on("p-type", "change", v => update(x => { x.type = v.trim() || f.type; }));
  on("p-default", "change", v => update(x => { if (v.trim()) x.default = v.trim(); else delete x.default; }));
  on("p-note", "change", v => update(x => { if (v) x.note = v; else delete x.note; }));
  on("p-changed", "change", (_, el) => update(x => { if (el.checked) x.changed = true; else delete x.changed; }));
  panel.querySelectorAll("input[data-flag]").forEach(cb => cb.addEventListener("change", () => update(x => { x[cb.dataset.flag] = cb.checked; })));
  // The first explicit origin edit turns an implicit (same-name) origin into an explicit list.
  panel.querySelectorAll("button[data-rm]").forEach(b => b.addEventListener("click", () => update(x => { x.origin = (x.origin || []).filter(o => o !== b.dataset.rm); })));
  on("p-origin", "change", v => { if (v) update(x => { x.origin = [...(x.origin || []), v]; }); });
  on("p-move", "change", v => { if (v) moveField(e.id, f.id, v); });
  bindDelete("p-del", "del-field", () => {
    state.sel = { kind: "entity", id: e.id };
    commit(s => { const t = entityById(e.id, s.target); t.fields = t.fields.filter(x => x.id !== f.id); });
  });
}

function fieldChecklist(entity, chosen, attr) {
  return '<div class="checklist">' + entity.fields.map(f => '<label><input type="checkbox" ' + attr + '="' + esc(f.name) + '"' + (chosen.includes(f.name) ? " checked" : "") + "> " + esc(f.name) + "</label>").join("") + "</div>";
}

function renderRelation(rid) {
  const edit = isEditing(), model = activeModel();
  const r = model.relations.find(x => x.id === rid);
  if (!r) { state.sel = null; return renderSummary(); }
  const name = id => (entityById(id) || {}).name || "?";
  let html = '<section><button class="linkbtn" id="p-back" type="button">' + (hasTarget() ? S.backToSummary : S.backToTables) + '</button><div class="row"><h2>' + S.relation + "</h2>" + (state.diff ? chip(relationStatus(r)) : "") + "</div>";
  if (r.opaque) html += '<span class="muted">' + esc(S.opaqueReference) + "</span>";
  if (!edit) {
    html += '<span class="muted mono">' + esc(name(r.from)) + " " + esc(r.cardinality.from) + " : " + esc(r.cardinality.to) + " " + esc(name(r.to)) + "</span>";
    if (relationLabel(r)) html += '<span class="muted">' + esc(S.via(relationLabel(r))) + "</span>";
    panel.innerHTML = html + "</section>";
    bindBack();
    return;
  }
  const entityOptions = selected => state.target.entities.map(e => option(e.id, e.name, e.id === selected)).join("");
  const cardinalityOptions = selected => CARDINALITIES.map(c => option(c, c, c === selected)).join("");
  html += "<label>" + S.relationFrom + '<select id="p-from">' + entityOptions(r.from) + "</select></label>";
  html += '<div class="row"><label>' + S.cardinalityFrom + '<select id="p-cfrom">' + cardinalityOptions(r.cardinality.from) + "</select></label><label>" + S.cardinalityTo + '<select id="p-cto">' + cardinalityOptions(r.cardinality.to) + "</select></label></div>";
  html += "<label>" + S.relationTo + '<select id="p-to">' + entityOptions(r.to) + "</select></label>";
  html += "<h3>" + S.fromFields + "</h3>" + fieldChecklist(entityById(r.from), r.fromFields, "data-from-field");
  html += "<h3>" + S.toFields + "</h3>" + fieldChecklist(entityById(r.to), r.toFields, "data-to-field");
  html += "<label>" + S.label + '<input type="text" class="mono" id="p-label" value="' + esc(r.label || "") + '" placeholder="' + esc(r.fromFields.join(", ")) + '"></label>';
  html += '<button class="btn danger" id="p-del" type="button">' + armed("del-rel", S.deleteRelation) + "</button></section>";
  panel.innerHTML = html;
  bindBack();
  const update = fn => commit(s => fn(s.target.relations.find(x => x.id === r.id)));
  on("p-from", "change", v => update(x => { x.from = v; }));
  on("p-to", "change", v => update(x => { x.to = v; }));
  on("p-cfrom", "change", v => update(x => { x.cardinality.from = v; }));
  on("p-cto", "change", v => update(x => { x.cardinality.to = v; }));
  on("p-label", "change", v => update(x => { if (v.trim()) x.label = v.trim(); else delete x.label; }));
  const toggleIn = (key, attr) => panel.querySelectorAll("input[" + attr + "]").forEach(cb => cb.addEventListener("change", () => update(x => {
    const set = new Set(x[key]);
    if (cb.checked) set.add(cb.getAttribute(attr)); else set.delete(cb.getAttribute(attr));
    x[key] = [...set];
  })));
  toggleIn("fromFields", "data-from-field");
  toggleIn("toFields", "data-to-field");
  bindDelete("p-del", "del-rel", () => {
    state.sel = null;
    commit(s => { s.target.relations = s.target.relations.filter(x => x.id !== r.id); });
  });
}

function renderGroup(gid) {
  const g = state.layout.groups.find(x => x.id === gid);
  if (!g || !isEditing()) { state.sel = null; return renderSummary(); }
  const picking = state.grouping === gid;
  let html = '<section><button class="linkbtn" id="p-back" type="button">' + S.backToSummary + '</button><div class="row"><h2>' + S.group + "</h2></div>";
  html += "<label>" + S.groupName + '<input type="text" id="p-gname" value="' + esc(g.name) + '"></label>';
  html += '<button class="btn" id="p-gpick" type="button" aria-pressed="' + picking + '">' + (picking ? S.groupPickEnd : S.groupPick) + "</button>";
  html += '<p class="muted">' + S.groupDragHelp + "</p></section>";
  const members = g.members.map(id => entityById(id)).filter(Boolean);
  html += "<section><h3>" + S.groupTables + " (" + members.length + ')</h3><div class="items">' + members.map(e => '<div class="item" tabindex="0" data-eid="' + esc(e.id) + '"><span class="nm">' + esc(e.name) + "</span></div>").join("") + "</div></section>";
  html += '<section><button class="btn danger" id="p-gdel" type="button">' + armed("del-grp", S.groupDissolve) + '</button><p class="muted">' + S.groupDissolveHelp + "</p></section>";
  panel.innerHTML = html;
  bindBack();
  on("p-gname", "change", v => commit(s => { s.layout.groups.find(x => x.id === gid).name = groupName(v); }));
  on("p-gpick", "click", () => startGrouping(picking ? null : gid));
  panel.querySelectorAll(".item[data-eid]").forEach(el => el.addEventListener("click", () => { if (state.grouping) startGrouping(null); select({ kind: "entity", id: el.dataset.eid }); }));
  bindDelete("p-gdel", "del-grp", () => {
    state.sel = null;
    state.grouping = null;
    commit(s => { s.layout.groups = s.layout.groups.filter(x => x.id !== gid); });
  });
}

// Group names are free text; only surrounding whitespace is trimmed.
function groupName(value) {
  return value.trim() || S.groupFallbackName;
}

