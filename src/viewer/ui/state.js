// Shared viewer state plus read helpers. Rendering modules read it; only commit() (actions.js) writes edits.
import { NO_KIND } from "../../model/page-data.js";
import { estimateHeight } from "../layout.js";
import { readLocalJson, writeLocal } from "../storage.js";

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
  tileTables: new Set(),
  hiddenKinds: new Set(),
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

// ---------- data kinds ----------
export function kindKeys() { return Object.keys(state.page.config.dataKinds); }
export function kindLabel(kind) { return kind && state.page.config.dataKinds[kind] ? state.page.config.dataKinds[kind].label : ""; }
/** CSS class for a kind; kinds are user strings, so classes use their position instead of the raw text. */
export function kindClass(kind) { const i = kindKeys().indexOf(kind); return i < 0 ? "" : "k-" + i; }

/** Kind of an entity: its own kind, else config.entityKinds by name, else (target) the kind of its first classified origin. */
export function kindOf(entity, { ignoreOwn = false } = {}) {
  const { dataKinds, entityKinds } = state.page.config;
  if (!ignoreOwn && entity.kind === NO_KIND) return null;
  if (!ignoreOwn && entity.kind && dataKinds[entity.kind]) return entity.kind;
  const byName = entityKinds[entity.name];
  if (byName) return byName === NO_KIND ? null : byName;
  for (const name of entity.origin || []) if (entityKinds[name] && entityKinds[name] !== NO_KIND) return entityKinds[name];
  return null;
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

// ---------- tile tables ----------
/** For a relation touching exactly one tile table: { tile, other }; null when it is drawn as a line. */
export function tileOf(model, relation) {
  if (relation.from === relation.to) return null;
  const a = entityById(relation.from, model), b = entityById(relation.to, model);
  const ta = !!a && state.tileTables.has(a.name), tb = !!b && state.tileTables.has(b.name);
  if (ta === tb) return null;
  return ta ? { tile: a, other: relation.to } : { tile: b, other: relation.from };
}

// ---------- per-viewer preferences (localStorage only) ----------
export function loadPrefs(prefsKey, config) {
  state.prefsKey = prefsKey;
  const tiles = readLocalJson(prefsKey + ":tile-tables", null);
  state.tileTables = new Set(Array.isArray(tiles) ? tiles : config.tileTables);
  const hidden = readLocalJson(prefsKey + ":hidden-kinds", []);
  state.hiddenKinds = new Set(Array.isArray(hidden) ? hidden : []);
  state.showIndexes = readLocalJson(prefsKey + ":show-indexes", false) === true;
  state.dimReviewed = readLocalJson(prefsKey + ":dim-reviewed", false) === true;
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
