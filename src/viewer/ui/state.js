// Shared viewer state plus read helpers. Rendering modules read it; only commit() (actions.js) writes edits.
import { UNASSIGNED } from "../../model/page-data.js";
import { classificationAxes, classify } from "../classify.js";
import { estimateHeight } from "../layout.js";
import { SPACING_RANGE } from "../layout-force.js";
import { LINE_TYPES, hiddenLineTypesFrom, isRelationHidden as hiddenByLineTypes } from "../line-visibility.js";
import { readLocalJson, writeLocal } from "../storage.js";
import { tileDisplaysFrom, tileOf as tileRule } from "../tiles.js";

export const BOX_WIDTH = 236;
const UNDO_LIMIT = 60;

export const state = {
  page: null,          // validated injected data: { current, target, layout, config }
  current: null,       // current model (read only)
  target: null,        // editable working copy of the target model, or null in pure viewer mode
  builtInBase: null,   // fingerprint of the page's built-in target (snapshot-base.js), null without a target
  base: null,          // fingerprint of the built-in target the held state is based on; written with every save
  layout: null,        // { current: {id: [x, y]}, target: {...}, groups: [] }
  view: "current",     // "target" | "current"
  zoom: 0.8,
  pan: { x: 24, y: 24 },
  diff: null,
  sel: null,           // { kind: "entity"|"field"|"rel"|"group", id, eid?, fid? }
  confirm: null,       // armed delete button id
  linking: false,
  linkFrom: null,
  grouping: null,      // id of the group whose members are being picked
  undo: [],
  multiSel: new Set(),
  arrangedFrom: { current: null, target: null }, // positions before the first automatic arrangement (session only)
  prefsKey: "",
  tileDisplays: new Map(), // tile table name -> "tile" | "badge" (per viewer)
  hidden: { kind: new Set(), module: new Set() }, // filtered-out values per axis, UNASSIGNED for "none"
  moduleView: false,   // show modules instead of tables (a viewer setting, not part of the model)
  hiddenLines: new Set(), // line types switched off in the legend (line-visibility.js; a viewer setting, drawing only)
  forceSpacing: 1,     // spacing factor of "Arrange by forces" (slider; a viewer setting)
  showIndexes: false,
  dimReviewed: false,
  zoneGap: 320,
  groupJoin: 100,
  dragging: false,
};

export function hasTarget() { return !!state.target; }
export function isEditing() { return hasTarget() && state.view === "target"; }
export function activeModel() { return state.view === "target" ? state.target : state.current; }
export function otherModel() { return state.view === "target" ? state.current : state.target; }
export function activePositions() { return state.layout[state.view]; }
export function entityById(id, model = activeModel()) { return model.entities.find(e => e.id === id); }
export function indexesOf(entity, model = activeModel()) { return model.indexes.filter(i => i.entity === entity.id); }

export function pushUndo() {
  state.undo.push(JSON.stringify({ target: state.target, layout: state.layout }));
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
}
export function popUndo() {
  const prev = state.undo.pop();
  if (!prev) return false;
  const parsed = JSON.parse(prev);
  state.target = parsed.target;
  state.layout = parsed.layout;
  return true;
}

// ---------- classification axes: data kind ("kind") and module ("module") ----------
// Category keys are user strings, so CSS classes use their position instead of the raw text.
const AXIS_CLASS_PREFIX = { kind: "k-", module: "m-" };
function axis(name) { return classificationAxes(state.page.config)[name]; }
export function axisKeys(name) { return Object.keys(axis(name).categories); }
export function axisSpec(name, key) { return (key && axis(name).categories[key]) || null; }
export function axisLabel(name, key) { const spec = axisSpec(name, key); return spec ? spec.label : ""; }
export function axisClass(name, key) { const i = axisKeys(name).indexOf(key); return i < 0 ? "" : AXIS_CLASS_PREFIX[name] + i; }
/** Value of an axis for an entity (see classify.js); null when unassigned. */
export function axisOf(name, entity, options) { return classify(entity, axis(name), options); }
export function kindOf(entity) { return axisOf("kind", entity); }
export function moduleOf(entity) { return axisOf("module", entity); }
/** True when a filter button hides the entity's data kind or module. */
export function isFilteredOut(entity) {
  return state.hidden.kind.has(kindOf(entity) || UNASSIGNED) || state.hidden.module.has(moduleOf(entity) || UNASSIGNED);
}

// ---------- diff lookups for the shown view ("same" in pure viewer mode) ----------
export function entityStatus(entity) {
  if (!state.diff) return null;
  return state.view === "target" ? state.diff.target.entities[entity.id] : state.diff.current.entities[entity.id];
}
export function fieldStatus(field) {
  if (!state.diff) return "same";
  return state.view === "target" ? state.diff.target.fields[field.id] : state.diff.current.fields[field.id].status;
}
export function relationStatus(relation) {
  if (!state.diff) return "same";
  return (state.view === "target" ? state.diff.target.relations : state.diff.current.relations)[relation.id] || "same";
}

// ---------- line visibility (legend toggles) ----------
/** True when the current or the target model has an opaque relation (the legend entry depends on it). */
export function hasOpaqueRelations() {
  return [state.current, state.target].some(model => model && model.relations.some(r => r.opaque));
}
/**
 * Line types whose legend toggle acts in the shown view: the diff statuses in the table view of a page with a
 * target (the module view draws no relation lines, its arrows have no status), "opaque" whenever a model has any.
 */
export function switchableLineTypes() {
  return LINE_TYPES.filter(type => (type === "opaque" ? hasOpaqueRelations() : !!state.diff && !state.moduleView));
}
/** True while the viewer has switched this relation's line off in the legend. Drawing only: layouts never ask this. */
export function isRelationHidden(relation) {
  return hiddenByLineTypes(relation, relationStatus(relation), state.hiddenLines, !!state.diff);
}

// ---------- tile tables ----------
/** For a relation drawn as a tile or badge: { tile, other, display }; null when it is a line (rule: tiles.js). */
export function tileOf(model, relation) { return tileRule(model, relation, state.tileDisplays); }
export function saveTileDisplays() { savePref("tile-tables", Object.fromEntries(state.tileDisplays)); }

// ---------- per-viewer preferences (localStorage only) ----------
export function loadPrefs(prefsKey, config) {
  state.prefsKey = prefsKey;
  state.tileDisplays = tileDisplaysFrom(readLocalJson(prefsKey + ":tile-tables", null), config.tileTables);
  for (const [name, pref] of [["kind", "hidden-kinds"], ["module", "hidden-modules"]]) {
    const hidden = readLocalJson(prefsKey + ":" + pref, []);
    state.hidden[name] = new Set(Array.isArray(hidden) ? hidden : []);
  }
  // Only with modules configured: otherwise the toggle is hidden and a saved "on" would trap the viewer.
  state.moduleView = Object.keys(config.modules).length > 0 && readLocalJson(prefsKey + ":module-view", false) === true;
  state.showIndexes = readLocalJson(prefsKey + ":show-indexes", false) === true;
  state.hiddenLines = hiddenLineTypesFrom(readLocalJson(prefsKey + ":hidden-lines", null), readLocalJson(prefsKey + ":hide-opaque", false));
  state.dimReviewed = readLocalJson(prefsKey + ":dim-reviewed", false) === true;
  const spacing = readLocalJson(prefsKey + ":force-spacing", null);
  if (Number.isFinite(spacing) && spacing >= SPACING_RANGE.min && spacing <= SPACING_RANGE.max) state.forceSpacing = spacing;
  const zoneGap = readLocalJson(prefsKey + ":zone-gap", null), groupJoin = readLocalJson(prefsKey + ":group-join", null);
  if (Number.isFinite(zoneGap)) state.zoneGap = zoneGap;
  if (Number.isFinite(groupJoin)) state.groupJoin = groupJoin;
}
export function savePref(name, value) {
  writeLocal(state.prefsKey + ":" + name, JSON.stringify(value instanceof Set ? [...value] : value));
}

export function estimatedBox(entity, model) {
  return { w: BOX_WIDTH, h: estimateHeight(entity.fields.length, state.showIndexes ? indexesOf(entity, model).length : 0) };
}
