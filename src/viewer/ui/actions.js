// State changes: every edit of the target model or the layout goes through commit() (undo + save).
import { isIndexExpression } from "../../model/normalize.js";
import { computeDiff } from "../diff.js";
import { arrangeByKind, arrangeByRelations } from "../layout.js";
import { advanceForceSimulation, arrangeForces, createForceSimulation, framePositions } from "../layout-force.js";
import { arrangeRadial } from "../layout-radial.js";
import { S } from "../strings.js";
import {
  state, activeModel, activePositions, entityById, estimatedBox, isEditing, isRelationHidden, axisKeys, kindOf, moduleOf, pushUndo, popUndo, savePref, tileOf, BOX_WIDTH,
} from "./state.js";
import { playArrangement } from "./arrange-animation.js";
import { view } from "./view.js";

const hooks = { afterCommit: () => {} };
/** main.js wires saving in here so this module does not depend on the persistence setup. */
export function onCommit(fn) { hooks.afterCommit = fn; }

// The last "Arrange by forces" run of this session: its start boxes, inputs and the positions now shown. The spacing
// slider re-runs it from the same start, so a factor always gives the same layout and moving back restores it
// (nothing compounds). Cleared by any other commit.
let lastForceRun = null;
let pendingSpacingPreview = 0;

let sequence = 0;
function newId(prefix) { sequence += 1; return prefix + Date.now().toString(36) + sequence.toString(36); }

/** Identifier-safe name: letters, digits, underscore and dots (schema-qualified names). */
function identifier(value, fallback) {
  const cleaned = String(value || "").replace(/[^A-Za-z0-9_.]/g, "");
  return cleaned || fallback;
}

// Keeps the target model loadable after any edit: drops references to fields or tables that no longer exist.
function repairReferences(model, layout) {
  const byId = new Map(model.entities.map(e => [e.id, e]));
  const names = id => new Set((byId.get(id) || { fields: [] }).fields.map(f => f.name));
  model.relations = model.relations.filter(r => byId.has(r.from) && byId.has(r.to));
  for (const r of model.relations) {
    const fromNames = names(r.from), toNames = names(r.to);
    r.fromFields = r.fromFields.filter(n => fromNames.has(n));
    r.toFields = r.toFields.filter(n => toNames.has(n));
  }
  model.indexes = model.indexes.filter(i => byId.has(i.entity)).map(i => ({ ...i, fields: i.fields.filter(n => isIndexExpression(n) || names(i.entity).has(n)) })).filter(i => i.fields.length);
  for (const g of layout.groups) g.members = g.members.filter(id => byId.has(id));
  for (const id of Object.keys(layout.target)) if (!byId.has(id)) delete layout.target[id];
}

export function refresh() {
  state.diff = state.target ? computeDiff(state.current, state.target) : null;
  view.renderCanvas();
  view.renderPanel();
  view.renderChrome();
}

/** Applies fn(state) as one undoable step and schedules saving. */
export function commit(fn) {
  // Any other edit ends the force run the spacing slider re-runs (see setForceSpacing).
  lastForceRun = null;
  pushUndo();
  fn(state);
  if (state.target) repairReferences(state.target, state.layout);
  refresh();
  hooks.afterCommit();
}

export function undo() {
  if (!popUndo()) return;
  if (state.sel && state.sel.kind !== "rel" && !entityById(state.sel.eid || state.sel.id)) state.sel = null;
  refresh();
  hooks.afterCommit();
}

export function select(sel, focusId) {
  state.sel = sel;
  state.confirm = null;
  view.renderCanvas();
  view.renderPanel();
  if (sel && (sel.kind === "entity" || sel.kind === "field")) centerOnIfHidden(sel.eid || sel.id);
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); if (el.select) el.select(); }
  }
}

function centerOnIfHidden(id) {
  const b = view.boxOf(id);
  if (!b) return;
  const { width, height } = view.viewportSize();
  const left = b.x * state.zoom + state.pan.x, top = b.y * state.zoom + state.pan.y;
  if (left < 0 || top < 0 || left + 60 > width || top + 40 > height) view.centerOn(id);
}

export function setView(viewName) {
  state.multiSel.clear();
  if (state.view === viewName) return;
  state.view = viewName;
  state.sel = null;
  state.linking = false; state.linkFrom = null; state.grouping = null;
  refresh();
  view.fitAll();
}

/** Switches between tables and the module view (a per-viewer setting; the model and layout stay untouched). */
export function setModuleView(on) {
  state.multiSel.clear();
  if (state.moduleView === on) return;
  state.moduleView = on;
  state.sel = null;
  state.linking = false; state.linkFrom = null; state.grouping = null;
  savePref("module-view", on);
  refresh();
  view.fitAll();
}

/**
 * Switches one line type (legend entry) on or off: a per-viewer drawing setting, nothing moves. A selected relation
 * that gets hidden is deselected; a selected module arrow that gets hidden falls back to the summary in the module panel.
 */
export function toggleLineType(type) {
  if (state.hiddenLines.has(type)) state.hiddenLines.delete(type); else state.hiddenLines.add(type);
  savePref("hidden-lines", state.hiddenLines);
  if (state.sel && state.sel.kind === "rel") {
    const relation = activeModel().relations.find(r => r.id === state.sel.id);
    if (relation && isRelationHidden(relation)) state.sel = null;
  }
  refresh();
}

// ---------- positions ----------
/** Gives every entity without a stored position one: all by data kind when none is placed, else a row below. */
export function placeMissing(viewName) {
  const model = viewName === "target" ? state.target : state.current;
  if (!model) return;
  const positions = state.layout[viewName];
  const missing = model.entities.filter(e => !positions[e.id]);
  if (!missing.length) return;
  const boxes = model.entities.map(e => ({ id: e.id, x: 0, y: 0, ...estimatedBox(e, model) }));
  if (missing.length === model.entities.length) {
    Object.assign(positions, arrangeByKind(boxes, axisKeys("kind"), id => kindOf(entityById(id, model))));
    return;
  }
  const placed = model.entities.filter(e => positions[e.id]);
  let x = Math.min(...placed.map(e => positions[e.id][0]));
  const y = Math.max(...placed.map(e => positions[e.id][1] + estimatedBox(e, model).h)) + 120;
  for (const e of missing) { positions[e.id] = [x, y]; x += BOX_WIDTH + 54; }
}

function measuredBoxes(model) {
  const positions = activePositions();
  return model.entities.map(e => {
    const b = view.boxOf(e.id), est = estimatedBox(e, model);
    return { id: e.id, x: positions[e.id][0], y: positions[e.id][1], w: b ? b.w : est.w, h: b ? b.h : est.h };
  });
}

export function arrange(how) {
  view.flash(S.arranging);
  // Let the status text paint before the (synchronous) layout run.
  setTimeout(() => {
    const model = activeModel(), viewName = state.view;
    const boxes = measuredBoxes(model);
    const apply = pos => {
      commit(s => {
        if (!s.arrangedFrom[viewName]) s.arrangedFrom[viewName] = JSON.parse(JSON.stringify(s.layout[viewName]));
        Object.assign(s.layout[viewName], pos);
      });
      view.flash("");
    };
    let pos;
    // Relations drawn as tiles do not pull tables together.
    const lines = () => model.relations.filter(r => !tileOf(model, r));
    // Group members pull together without a line (groups exist in the editor only).
    const groupPairs = () => (isEditing() ? state.layout.groups.flatMap(g => g.members.slice(1).map(id => [g.members[0], id, 2])) : []);
    if (how === "relations") {
      pos = arrangeByRelations(boxes, lines(), { extra: groupPairs() }).pos;
    } else if (how === "forces") {
      // Hidden opaque references still pull: hiding them is drawing only, as in the module view.
      const relations = lines(), options = { moduleOf: id => moduleOf(entityById(id, model)), extra: groupPairs() };
      const final = arrangeForces(boxes, relations, { ...options, spacing: state.forceSpacing });
      // The view is fitted to the result first, then the same simulation is replayed frame by frame.
      view.previewPositions(final.pos);
      view.fitAll();
      const simulation = createForceSimulation(boxes, relations, { ...options, spacing: state.forceSpacing });
      playArrangement(share => (advanceForceSimulation(simulation, share) ? framePositions(simulation, final.shift) : null), () => {
        apply(final.pos);
        lastForceRun = { view: viewName, start: boxes, relations, options, result: final.pos };
        view.renderChrome();
      });
      return;
    } else if (how === "radial") {
      // The centre is always searched (GF 20.11.2026): a table that happens to be selected must not change the star.
      const kinds = axisKeys("kind");
      const rank = id => { const i = kinds.indexOf(kindOf(entityById(id, model))); return i < 0 ? kinds.length : i; };
      pos = arrangeRadial(boxes, lines(), { rank }).pos;
    } else {
      pos = arrangeByKind(boxes, axisKeys("kind"), id => kindOf(entityById(id, model)));
    }
    apply(pos);
    view.fitAll();
  }, 30);
}

// ---------- spacing of the force layout ----------
/** True while the shown layout is still the result of the last force run, so the slider re-arranges it live. */
export function isForceSpacingLive() {
  const run = lastForceRun;
  if (!run || run.view !== state.view || state.moduleView) return false;
  const positions = activePositions(), ids = Object.keys(run.result);
  return ids.length === activeModel().entities.length && ids.every(id => positions[id] && positions[id][0] === run.result[id][0] && positions[id][1] === run.result[id][1]);
}

const rerunForces = spacing => arrangeForces(lastForceRun.start, lastForceRun.relations, { ...lastForceRun.options, spacing }).pos;

/**
 * The spacing slider. While dragging (final = false) the layout is only previewed, at most once per frame; on release
 * (final = true) the factor is saved and, when the force layout is live, applied as one undo step. When the shown layout
 * is no longer the force result, the factor only waits for the next "Arrange by forces".
 */
export function setForceSpacing(spacing, final) {
  state.forceSpacing = spacing;
  cancelAnimationFrame(pendingSpacingPreview);
  const live = isForceSpacingLive();
  if (!final) {
    if (live) pendingSpacingPreview = requestAnimationFrame(() => { if (isForceSpacingLive()) view.previewPositions(rerunForces(spacing)); });
    return;
  }
  savePref("force-spacing", spacing);
  if (!live) { view.renderChrome(); return; }
  const run = lastForceRun, pos = rerunForces(spacing);
  commit(s => { Object.assign(s.layout[run.view], pos); });
  lastForceRun = { ...run, result: pos };
  view.renderChrome();
}

/** Module view "Arrange": forgets the dragged module positions, back to the derived arrangement (undoable). */
export function clearModulePositions() {
  commit(s => { s.layout.modules = {}; });
  view.fitAll();
}

export function restoreArrangement() {
  const saved = state.arrangedFrom[state.view];
  if (!saved) return;
  commit(s => { s.layout[s.view] = saved; s.arrangedFrom[s.view] = null; });
  view.fitAll();
}

// ---------- target edits ----------
function uniqueEntityName(base) {
  const names = new Set(state.target.entities.map(e => e.name));
  let name = base, i = 2;
  while (names.has(name)) name = base + i++;
  return name;
}

export function addTable() {
  if (!isEditing()) return;
  const id = newId("e");
  const { width, height } = view.viewportSize();
  const [x, y] = view.worldPointAt(width / 2, height / 3);
  commit(s => {
    s.target.entities.push({ id, name: uniqueEntityName("NewTable"), origin: [], fields: [{ id: newId("f"), name: "id", type: "String", list: false, nullable: false, pk: true, uk: false, fk: false, origin: [] }] });
    s.layout.target[id] = [Math.round(x - BOX_WIDTH / 2), Math.round(y)];
  });
  select({ kind: "entity", id }, "p-name");
}

export function addField(entityId) {
  const fid = newId("f");
  commit(s => {
    const e = entityById(entityId, s.target);
    const names = new Set(e.fields.map(f => f.name));
    let name = "newField", i = 2;
    while (names.has(name)) name = "newField" + i++;
    e.fields.push({ id: fid, name, type: "String", list: false, nullable: false, pk: false, uk: false, fk: false, origin: [] });
  });
  select({ kind: "field", eid: entityId, fid }, "p-name");
}

/** Renames an entity; refuses a name that already exists. */
export function renameEntity(entityId, value) {
  const e = entityById(entityId, state.target);
  const name = identifier(value, e.name);
  if (name === e.name) return refresh();
  if (state.target.entities.some(x => x.name === name)) { view.flash(S.nameTaken(name)); return refresh(); }
  commit(s => { entityById(entityId, s.target).name = name; });
}

/** Renames a field and every relation / index reference to it; refuses a duplicate within the table. */
export function renameField(entityId, fieldId, value) {
  const e = entityById(entityId, state.target), f = e.fields.find(x => x.id === fieldId);
  const name = identifier(value, f.name);
  if (name === f.name) return refresh();
  if (e.fields.some(x => x.name === name)) { view.flash(S.nameTaken(e.name + "." + name)); return refresh(); }
  commit(s => {
    const old = f.name;
    entityById(entityId, s.target).fields.find(x => x.id === fieldId).name = name;
    const swap = list => list.map(n => (n === old ? name : n));
    for (const r of s.target.relations) {
      if (r.from === entityId) r.fromFields = swap(r.fromFields);
      if (r.to === entityId) r.toFields = swap(r.toFields);
    }
    for (const i of s.target.indexes) if (i.entity === entityId) i.fields = swap(i.fields);
  });
}

export function setReviewed(entityId, reviewed) {
  commit(s => {
    const e = entityById(entityId, s.target);
    if (reviewed) e.reviewed = true; else delete e.reviewed;
  });
}

export function moveField(entityId, fieldId, toEntityId) {
  const source = entityById(entityId, state.target), dest = entityById(toEntityId, state.target);
  const f = source.fields.find(x => x.id === fieldId);
  if (dest.fields.some(x => x.name === f.name)) { view.flash(S.nameTaken(dest.name + "." + f.name)); return refresh(); }
  commit(s => {
    const from = entityById(entityId, s.target), to = entityById(toEntityId, s.target);
    to.fields.push(from.fields.splice(from.fields.findIndex(x => x.id === fieldId), 1)[0]);
  });
  select({ kind: "field", eid: toEntityId, fid: fieldId });
}

export function startLinking(on) {
  state.linking = on == null ? !state.linking : on;
  state.linkFrom = null;
  view.renderChrome();
}

export function pickForLink(entityId) {
  if (!state.linkFrom) { state.linkFrom = entityId; view.renderChrome(); return; }
  const from = state.linkFrom, rid = newId("r");
  startLinking(false);
  commit(s => s.target.relations.push({ id: rid, from, to: entityId, fromFields: [], toFields: [], cardinality: { from: "n", to: "1" } }));
  select({ kind: "rel", id: rid }, "p-label");
}

export function startGrouping(groupId) {
  state.grouping = groupId || null;
  view.renderChrome();
  view.renderCanvas();
  view.renderPanel();
}

export function toggleGroupMember(entityId) {
  const gid = state.grouping;
  commit(s => {
    const g = s.layout.groups.find(x => x.id === gid);
    if (!g) return;
    const i = g.members.indexOf(entityId);
    if (i >= 0) g.members.splice(i, 1); else g.members.push(entityId);
  });
}

export function addGroup() {
  if (state.grouping) { startGrouping(null); return; }
  const gid = newId("g");
  const first = state.sel && state.sel.kind === "entity" ? [state.sel.id] : [];
  commit(s => { s.layout.groups.push({ id: gid, name: S.groupDefaultName, members: first }); });
  state.sel = { kind: "group", id: gid };
  startGrouping(gid);
  const el = document.getElementById("p-gname");
  if (el) { el.focus(); el.select(); }
}
