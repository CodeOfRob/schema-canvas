// Infinite canvas: tables as absolutely positioned boxes in a translated + scaled "world", relations as SVG.
import { boxBorderPoint } from "../geometry.js";
import { freezeModulePositions } from "../layout.js";
import { STATUS_LABEL, S } from "../strings.js";
import {
  state, activeModel, activePositions, axisClass, axisKeys, axisLabel, entityById, entityStatus, fieldStatus, hasOpaqueRelations, indexesOf, isEditing, isFilteredOut, isOpaqueHidden, kindOf, relationStatus, tileOf,
} from "./state.js";
import { addField, commit, pickForLink, renameEntity, renameField, select, setReviewed, toggleGroupMember } from "./actions.js";
import { esc } from "./html.js";
import { drawModuleEdges, renderModuleCanvas } from "./module-view.js";

const SNAP = 10;
let viewport, world, links;

export function chip(status) {
  return '<span class="chip s-' + status + '">' + esc(STATUS_LABEL[status]) + "</span>";
}

/** Type as shown in a table row: base type plus [] for lists and ? for nullable. */
export function fieldTypeText(f) {
  return f.type + (f.list ? "[]" : "") + (f.nullable ? "?" : "");
}
export function fieldKeysText(f) {
  return [f.pk && "PK", f.fk && "FK", f.uk && "UK"].filter(Boolean).join(" ");
}
export function indexText(i) {
  return i.fields.join(", ") + (i.where ? " WHERE " + i.where : "");
}
/** Index name and note for tooltips and the inspector. */
export function indexDescription(i) {
  return [i.name, i.note].filter(Boolean).join(" · ");
}
export function relationLabel(r) {
  return r.label || r.fromFields.join(", ");
}

export function viewportSize() { return { width: viewport.clientWidth, height: viewport.clientHeight }; }
/** World coordinates of a point given in viewport pixels. */
export function worldPointAt(vx, vy) { return [(vx - state.pan.x) / state.zoom, (vy - state.pan.y) / state.zoom]; }

export function boxOf(id) {
  const el = world.querySelector('.ent[data-id="' + CSS.escape(id) + '"]');
  if (!el) return null;
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}

function groupOfSelection() {
  return state.grouping ? state.layout.groups.find(g => g.id === state.grouping) : null;
}

// Relations of tile tables in badge display: a badge "-> Target" on the referencing foreign-key field instead of a line.
// Returns entity id -> { fields: field name -> [relation], header: [relation] } (header: relations without fromFields).
function badgesByEntity(model) {
  const result = new Map();
  for (const r of model.relations) {
    const t = tileOf(model, r);
    if (!t || t.display !== "badge" || isOpaqueHidden(r)) continue;
    if (!result.has(r.from)) result.set(r.from, { fields: new Map(), header: [] });
    const slot = result.get(r.from), owner = entityById(r.from, model);
    const names = r.fromFields.filter(name => owner.fields.some(f => f.name === name));
    if (!names.length) slot.header.push(r);
    for (const name of names) slot.fields.set(name, [...(slot.fields.get(name) || []), r]);
  }
  return result;
}

function badgeHtml(r, model) {
  const target = entityById(r.to, model).name;
  const selected = state.sel && state.sel.kind === "rel" && state.sel.id === r.id;
  return '<span class="fbadge' + (selected ? " sel" : "") + '" data-rid="' + esc(r.id) + '" title="' + esc(S.tileBadgeTitle(target, relationLabel(r))) + '">→ ' + esc(target) + "</span>";
}

function entityHtml(e, model, badges) {
  const st = entityStatus(e);
  const review = isEditing() ? '<input type="checkbox" class="rv" title="' + esc(S.reviewedCheckboxTitle) + '" aria-label="' + esc(S.reviewedCheckboxLabel(e.name)) + '"' + (e.reviewed ? " checked" : "") + ">" : "";
  const headerBadges = badges ? badges.header.map(r => badgeHtml(r, model)).join("") : "";
  let html = '<div class="eh">' + review + '<span class="en">' + esc(e.name) + "</span>" + headerBadges + (st && st.status !== "same" ? chip(st.status) : "") + "</div>";
  for (const f of e.fields) {
    const selected = state.sel && state.sel.kind === "field" && state.sel.fid === f.id;
    const fieldBadges = badges && badges.fields.get(f.name);
    html += '<div class="fr st-' + fieldStatus(f) + (selected ? " sel" : "") + (fieldBadges ? " hasbadge" : "") + '" data-fid="' + esc(f.id) + '" title="' + esc(f.note || "") + '"><span class="fk">' + fieldKeysText(f) +
      '</span><span class="fn">' + esc(f.name) + "</span>" + (fieldBadges ? fieldBadges.map(r => badgeHtml(r, model)).join("") : "") + '<span class="ft">' + esc(fieldTypeText(f)) + "</span></div>";
  }
  if (state.showIndexes) {
    const list = indexesOf(e, model);
    if (list.length) html += '<div class="ixs">' + list.map(i => '<div class="ir" title="' + esc(indexDescription(i)) + '"><span class="fk">' + esc(i.unique ? S.indexUnique : S.indexPlain) + '</span><span class="fn">' + esc(indexText(i)) + "</span></div>").join("") + "</div>";
  }
  if (isEditing()) html += '<button class="addf" type="button">' + esc(S.addField) + "</button>";
  return html;
}

export function renderCanvas() {
  if (state.moduleView) {
    showHiddenOpaqueCount(renderModuleCanvas(world, links));
    applyTransform();
    return;
  }
  const model = activeModel(), positions = activePositions(), picking = groupOfSelection(), badges = badgesByEntity(model);
  world.querySelectorAll(".ent, .mod").forEach(n => n.remove());
  const frag = document.createDocumentFragment();
  for (const e of model.entities) {
    if (isFilteredOut(e)) continue;
    const kind = kindOf(e);
    const st = entityStatus(e);
    const el = document.createElement("div");
    const selected = state.sel && (state.sel.id === e.id || state.sel.eid === e.id) && state.sel.kind !== "rel" && state.sel.kind !== "group";
    el.className = "ent st-" + (st ? st.status : "same") + (kind ? " " + axisClass("kind", kind) : "") + (selected ? " sel" : "") + (state.multiSel.has(e.id) ? " msel" : "") + (picking && picking.members.includes(e.id) ? " gpick" : "") + (isEditing() && e.reviewed ? " done" : "");
    const [x, y] = positions[e.id];
    el.style.left = x + "px"; el.style.top = y + "px";
    el.dataset.id = e.id;
    el.tabIndex = 0;
    el.innerHTML = entityHtml(e, model, badges.get(e.id));
    frag.appendChild(el);
  }
  world.appendChild(frag);
  world.classList.toggle("dim-reviewed", state.dimReviewed && isEditing());
  drawLinks();
  applyTransform();
}

// One zone per island: tables of the same kind closer than zoneGap (edge to edge) share a background zone.
function drawZones() {
  world.querySelectorAll(".zone").forEach(n => n.remove());
  const pad = 28;
  for (const kind of axisKeys("kind")) {
    const cls = axisClass("kind", kind);
    const boxes = [...world.querySelectorAll(".ent." + cls)].map(el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
    if (!boxes.length) continue;
    const parent = boxes.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      const dx = Math.max(0, Math.max(A.x, B.x) - Math.min(A.x + A.w, B.x + B.w));
      const dy = Math.max(0, Math.max(A.y, B.y) - Math.min(A.y + A.h, B.y + B.h));
      if (Math.hypot(dx, dy) <= state.zoneGap) parent[find(i)] = find(j);
    }
    const islands = {};
    boxes.forEach((b, i) => (islands[find(i)] = islands[find(i)] || []).push(b));
    for (const group of Object.values(islands)) world.insertBefore(zoneElement("zone " + cls, group, pad, '<span class="zl">' + esc(axisLabel("kind", kind)) + "</span>"), world.firstChild);
  }
  if (!isEditing()) return;
  for (const g of state.layout.groups) {
    const els = g.members.map(id => world.querySelector('.ent[data-id="' + CSS.escape(id) + '"]')).filter(Boolean);
    if (!els.length) continue;
    const boxes = els.map(el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
    const selected = state.sel && state.sel.kind === "group" && state.sel.id === g.id;
    const label = '<span class="zl" data-gid="' + esc(g.id) + '" title="' + esc(S.groupLabelTitle) + '">' + esc(g.name || S.groupFallbackName) + "</span>";
    world.insertBefore(zoneElement("zone grp" + (selected ? " sel" : ""), boxes, 46, label), world.firstChild);
  }
}

function zoneElement(className, boxes, pad, labelHtml) {
  const x0 = Math.min(...boxes.map(b => b.x)) - pad, y0 = Math.min(...boxes.map(b => b.y)) - pad - 10;
  const x1 = Math.max(...boxes.map(b => b.x + b.w)) + pad, y1 = Math.max(...boxes.map(b => b.y + b.h)) + pad;
  const z = document.createElement("div");
  z.className = className;
  Object.assign(z.style, { left: x0 + "px", top: y0 + "px", width: x1 - x0 + "px", height: y1 - y0 + "px" });
  z.innerHTML = labelHtml;
  return z;
}

function labelSvg(r, x, y, selected) {
  const text = relationLabel(r) || "·";
  const w = Math.max(18, text.length * 6.4 + 10);
  const tooltip = r.opaque ? "<title>" + esc(S.opaqueReference) + "</title>" : "";
  return '<g class="lbl' + (selected ? " sel" : "") + (r.opaque ? " opaque" : "") + '" data-rid="' + esc(r.id) + '">' + tooltip + '<rect x="' + (x - w / 2) + '" y="' + (y - 9) + '" width="' + w + '" height="18" rx="4" /><text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle">' + esc(text) + "</text></g>";
}

/** The legend's "n opaque references hidden" note; shown only while the toggle hides them (a saved "hide" on a page
 * without opaque references shows nothing, like the hidden toggle). */
function showHiddenOpaqueCount(count) {
  const note = document.getElementById("opaque-hidden");
  note.hidden = !state.hideOpaque || !hasOpaqueRelations();
  note.textContent = S.opaqueHiddenCount(count);
}

/** Opaque relations the toggle keeps off the table canvas, counted only where they would otherwise be drawn. */
function hiddenOpaqueCount(model) {
  const shown = id => !isFilteredOut(entityById(id, model));
  const drawable = r => { const t = tileOf(model, r); return t ? shown(t.other) : shown(r.from) && shown(r.to); };
  return model.relations.filter(r => isOpaqueHidden(r) && drawable(r)).length;
}

export function drawLinks() {
  if (state.moduleView) { showHiddenOpaqueCount(drawModuleEdges(world, links)); return; }
  drawZones();
  const model = activeModel();
  showHiddenOpaqueCount(hiddenOpaqueCount(model));
  let out = "";
  // References to a tile table are not drawn as long lines: each referencing table gets its own small tile,
  // or (badge display) its foreign-key field a badge, rendered with the table in entityHtml.
  const tileRefs = {};
  for (const r of model.relations) {
    if (isOpaqueHidden(r)) continue;
    const t = tileOf(model, r);
    if (t && t.display === "badge") continue;
    if (t) {
      const perTable = tileRefs[t.other] = tileRefs[t.other] || {};
      (perTable[t.tile.name] = perTable[t.tile.name] || []).push(r);
      continue;
    }
    const a = boxOf(r.from), b = boxOf(r.to);
    if (!a || !b) continue;
    const st = relationStatus(r);
    const cls = [st === "added" || st === "removed" || st === "changed" ? st : "", r.opaque ? "opaque" : ""].filter(Boolean).join(" ");
    const selected = state.sel && state.sel.kind === "rel" && state.sel.id === r.id;
    if (r.from === r.to) {
      const x = a.x + a.w, y = a.y + 16;
      out += '<path class="' + cls + '" d="M' + x + " " + y + ' c 40 0 40 40 0 40" fill="none" />';
      out += labelSvg(r, x + 34, y + 20, selected);
      continue;
    }
    const pa = boxBorderPoint(a, b.x + b.w / 2, b.y + b.h / 2), pb = boxBorderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1, ux = (pb.x - pa.x) / len, uy = (pb.y - pa.y) / len;
    out += '<line class="' + cls + '" x1="' + pa.x + '" y1="' + pa.y + '" x2="' + pb.x + '" y2="' + pb.y + '" />';
    out += '<text class="card" x="' + (pa.x + ux * 14 - uy * 8) + '" y="' + (pa.y + uy * 14 + ux * 8 + 4) + '" text-anchor="middle">' + esc(r.cardinality.from) + "</text>";
    out += '<text class="card" x="' + (pb.x - ux * 14 - uy * 8) + '" y="' + (pb.y - uy * 14 + ux * 8 + 4) + '" text-anchor="middle">' + esc(r.cardinality.to) + "</text>";
    out += labelSvg(r, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, selected);
  }
  for (const [otherId, perTable] of Object.entries(tileRefs)) {
    const b = boxOf(otherId);
    if (!b) continue;
    let right = b.x + b.w - 8;
    for (const name of Object.keys(perTable).sort()) {
      const rels = perTable[name];
      const text = name + (rels.length > 1 ? " ×" + rels.length : "");
      const w = Math.max(48, Math.round(text.length * 7 + 18)), h = 20, x = right - w, y = b.y - h - 12;
      right = x - 6;
      const selected = state.sel && state.sel.kind === "rel" && rels.some(r => r.id === state.sel.id);
      out += '<line x1="' + (x + w / 2) + '" y1="' + (y + h) + '" x2="' + (x + w / 2) + '" y2="' + b.y + '" />';
      out += '<g class="lbl utile' + (selected ? " sel" : "") + '" data-rid="' + esc(rels[0].id) + '"><title>' + esc(name + ": " + rels.map(relationLabel).filter(Boolean).join(", ")) + '</title><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" /><text x="' + (x + w / 2) + '" y="' + (y + 14) + '" text-anchor="middle">' + esc(text) + "</text></g>";
    }
  }
  links.innerHTML = out;
}

export function applyTransform() {
  const { x, y } = state.pan, z = state.zoom;
  world.style.transform = "translate(" + x + "px, " + y + "px) scale(" + z + ")";
  viewport.style.backgroundSize = 20 * z + "px " + 20 * z + "px";
  viewport.style.backgroundPosition = x + "px " + y + "px";
  document.getElementById("zoomval").textContent = Math.round(z * 100) + " %";
}

export function setZoom(z, cx, cy) {
  const old = state.zoom;
  z = Math.min(2.5, Math.max(0.15, z));
  if (z === old) return;
  const vx = cx == null ? viewport.clientWidth / 2 : cx, vy = cy == null ? viewport.clientHeight / 2 : cy;
  const wx = (vx - state.pan.x) / old, wy = (vy - state.pan.y) / old;
  state.zoom = z;
  state.pan = { x: vx - wx * z, y: vy - wy * z };
  applyTransform();
}

export function centerOn(id) {
  const b = boxOf(id);
  if (!b) return;
  state.pan = { x: viewport.clientWidth / 2 - (b.x + b.w / 2) * state.zoom, y: viewport.clientHeight / 2 - (b.y + Math.min(b.h, 300) / 2) * state.zoom };
  applyTransform();
}

export function fitAll() {
  const boxes = [...world.querySelectorAll(".ent, .zone, .mod")].map(el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
  if (!boxes.length) return;
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
  const pad = 40, vw = viewport.clientWidth, vh = viewport.clientHeight;
  const z = Math.min(1.2, Math.max(0.15, Math.min((vw - pad * 2) / (x1 - x0), (vh - pad * 2) / (y1 - y0))));
  state.zoom = z;
  state.pan = { x: (vw - (x1 - x0) * z) / 2 - x0 * z, y: (vh - (y1 - y0) * z) / 2 - y0 * z };
  applyTransform();
}

export function clearMultiSelection() {
  if (!state.multiSel.size) return false;
  state.multiSel.clear();
  renderCanvas();
  return true;
}

// ---------- pointer handling: drag tables, pan the background, lasso, pick for relations / groups ----------
let drag = null;

function movingMembers(ids) {
  const positions = activePositions();
  return ids.map(id => ({ id, el: world.querySelector('.ent[data-id="' + CSS.escape(id) + '"]') })).filter(m => m.el && positions[m.id]).map(m => ({ ...m, ox: positions[m.id][0], oy: positions[m.id][1] }));
}

// Where a move drag writes: table positions of the shown tab, or the module boxes (one map for both tabs).
const tablePositionsOf = s => s.layout[s.view];
const modulePositionsOf = s => s.layout.modules;

/** One module box as a move drag; its position is read from the DOM because it may be derived, not saved yet. */
function movingModule(box) {
  return [{ id: box.dataset.module, el: box, ox: box.offsetLeft, oy: box.offsetTop }];
}

/** Positions of all shown module boxes, frozen into layout.modules by the first drag so nothing else jumps. */
function shownModulePositions() {
  return Object.fromEntries([...world.querySelectorAll(".mod")].map(el => [el.dataset.module, [el.offsetLeft, el.offsetTop]]));
}

function startDrag(ev, value) {
  drag = { sx: ev.clientX, sy: ev.clientY, moved: false, ...value };
  viewport.setPointerCapture(ev.pointerId);
}

function onPointerDown(ev) {
  if (ev.button !== 0 || ev.target.closest("input, button")) return;
  if (ev.shiftKey && !state.linking && !state.grouping && !state.moduleView) {
    ev.preventDefault();
    try { window.getSelection().removeAllRanges(); } catch { /* selection API missing: nothing to clear */ }
    const vr = viewport.getBoundingClientRect(), hit = ev.target.closest(".ent");
    const box = document.createElement("div");
    box.className = "lasso"; box.hidden = true;
    viewport.appendChild(box);
    startDrag(ev, { kind: "lasso", vx: ev.clientX - vr.left, vy: ev.clientY - vr.top, box, hitId: hit && hit.dataset.id });
    return;
  }
  const moduleEdge = ev.target.closest("g.medge");
  if (moduleEdge) { select({ kind: "module-edge", id: moduleEdge.dataset.edge }); return; }
  const label = ev.target.closest("g.lbl, .fbadge");
  if (label) { select({ kind: "rel", id: label.dataset.rid }); return; }
  const groupLabel = ev.target.closest(".zone.grp .zl");
  if (groupLabel && isEditing()) {
    const g = state.layout.groups.find(x => x.id === groupLabel.dataset.gid);
    startDrag(ev, { kind: "move", positionsOf: tablePositionsOf, members: movingMembers(g.members), onClick: () => select({ kind: "group", id: g.id }) });
    return;
  }
  const ent = ev.target.closest(".ent");
  const pan = onClick => startDrag(ev, { kind: "pan", px: state.pan.x, py: state.pan.y, onClick });
  const moduleBox = ev.target.closest(".mod");
  if (moduleBox) {
    const id = moduleBox.dataset.module;
    startDrag(ev, { kind: "move", positionsOf: modulePositionsOf, members: movingModule(moduleBox), shown: shownModulePositions(), joinGroups: false, onClick: () => select({ kind: "module", id }) });
    return;
  }
  if (!ent) { pan(null); return; }
  const id = ent.dataset.id;
  if (state.linking) { pickForLink(id); return; }
  if (state.grouping) { toggleGroupMember(id); return; }
  const row = ev.target.closest(".fr");
  if (row) { pan(() => select({ kind: "field", eid: id, fid: row.dataset.fid })); return; }
  if (ev.target.closest(".eh")) {
    const ids = state.multiSel.has(id) && state.multiSel.size > 1 ? [...state.multiSel] : [id];
    startDrag(ev, { kind: "move", id, positionsOf: tablePositionsOf, members: movingMembers(ids), joinGroups: ids.length === 1, onClick: () => select({ kind: "entity", id }) });
    return;
  }
  pan(() => select({ kind: "entity", id }));
}

function onPointerMove(ev) {
  if (!drag) return;
  const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  state.dragging = true;
  if (drag.kind === "pan") { viewport.classList.add("panning"); state.pan = { x: drag.px + dx, y: drag.py + dy }; applyTransform(); return; }
  if (drag.kind === "lasso") {
    const vr = viewport.getBoundingClientRect(), cx = ev.clientX - vr.left, cy = ev.clientY - vr.top;
    const l = Math.min(cx, drag.vx), t = Math.min(cy, drag.vy), w = Math.abs(cx - drag.vx), h = Math.abs(cy - drag.vy);
    Object.assign(drag.box.style, { left: l + "px", top: t + "px", width: w + "px", height: h + "px" });
    drag.box.hidden = false;
    const [x0, y0] = worldPointAt(l, t), [x1, y1] = worldPointAt(l + w, t + h);
    drag.rect = { x0, y0, x1, y1 };
    return;
  }
  drag.gx = Math.round(dx / state.zoom / SNAP) * SNAP;
  drag.gy = Math.round(dy / state.zoom / SNAP) * SNAP;
  for (const m of drag.members) { m.el.style.left = m.ox + drag.gx + "px"; m.el.style.top = m.oy + drag.gy + "px"; }
  drawLinks();
}

// Dropping one table near a group's other tables adds it; dropping it away from them removes it.
function groupMembershipAfterDrop(dr) {
  const result = {};
  const moved = dr.members[0];
  for (const g of state.layout.groups) {
    const others = g.members.filter(id => id !== dr.id).map(id => world.querySelector('.ent[data-id="' + CSS.escape(id) + '"]')).filter(Boolean);
    if (!others.length) { result[g.id] = g.members.includes(dr.id); continue; }
    const x0 = Math.min(...others.map(el => el.offsetLeft)), y0 = Math.min(...others.map(el => el.offsetTop));
    const x1 = Math.max(...others.map(el => el.offsetLeft + el.offsetWidth)), y1 = Math.max(...others.map(el => el.offsetTop + el.offsetHeight));
    const tx0 = moved.ox + dr.gx, ty0 = moved.oy + dr.gy, tx1 = tx0 + moved.el.offsetWidth, ty1 = ty0 + moved.el.offsetHeight;
    const gapX = Math.max(0, Math.max(x0, tx0) - Math.min(x1, tx1)), gapY = Math.max(0, Math.max(y0, ty0) - Math.min(y1, ty1));
    result[g.id] = Math.hypot(gapX, gapY) <= state.groupJoin;
  }
  return result;
}

function endDrag() {
  if (!drag) return;
  const dr = drag;
  drag = null;
  state.dragging = false;
  viewport.classList.remove("panning");
  if (dr.kind === "lasso") {
    dr.box.remove();
    if (!dr.moved) {
      if (dr.hitId) { if (state.multiSel.has(dr.hitId)) state.multiSel.delete(dr.hitId); else state.multiSel.add(dr.hitId); renderCanvas(); }
      return;
    }
    const r = dr.rect;
    world.querySelectorAll(".ent").forEach(el => {
      const x = el.offsetLeft, y = el.offsetTop;
      if (x < r.x1 && x + el.offsetWidth > r.x0 && y < r.y1 && y + el.offsetHeight > r.y0) state.multiSel.add(el.dataset.id);
    });
    renderCanvas();
    return;
  }
  if (!dr.moved) {
    if (dr.onClick) { dr.onClick(); return; }
    if (!clearMultiSelection() && !state.linking && !state.grouping) select(null);
    return;
  }
  if (dr.kind !== "move") return;
  const membership = isEditing() && dr.joinGroups ? groupMembershipAfterDrop(dr) : null;
  commit(s => {
    if (dr.shown) s.layout.modules = freezeModulePositions(s.layout.modules, dr.shown);
    const positions = dr.positionsOf(s);
    for (const m of dr.members) positions[m.id] = [m.ox + dr.gx, m.oy + dr.gy];
    if (!membership) return;
    for (const g of s.layout.groups) {
      const i = g.members.indexOf(dr.id);
      if (membership[g.id] && i < 0) g.members.push(dr.id);
      if (!membership[g.id] && i >= 0) g.members.splice(i, 1);
    }
  });
}

function inlineEdit(span, value, onCommit) {
  const input = document.createElement("input");
  input.className = "inl"; input.value = value;
  span.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    if (ok && input.value.trim() && input.value.trim() !== value) onCommit(input.value.trim()); else renderCanvas();
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); e.stopPropagation(); });
  input.addEventListener("blur", () => finish(true));
}

function onDoubleClick(ev) {
  if (!isEditing()) return;
  const ent = ev.target.closest(".ent");
  if (!ent) return;
  const e = entityById(ent.dataset.id);
  const nameSpan = ev.target.closest(".fn"), titleSpan = ev.target.closest(".en");
  if (nameSpan && nameSpan.closest(".fr")) {
    const f = e.fields.find(x => x.id === nameSpan.closest(".fr").dataset.fid);
    inlineEdit(nameSpan, f.name, v => renameField(e.id, f.id, v));
  } else if (titleSpan) {
    inlineEdit(titleSpan, e.name, v => renameEntity(e.id, v));
  }
}

export function initCanvas() {
  viewport = document.getElementById("viewport");
  world = document.getElementById("world");
  links = document.getElementById("links");
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("wheel", ev => {
    ev.preventDefault();
    // Wheel and trackpad pinch (ctrlKey) zoom around the pointer; panning is click-and-hold.
    const r = viewport.getBoundingClientRect(), k = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
    setZoom(state.zoom * Math.exp(-ev.deltaY * k * (ev.ctrlKey ? 0.01 : 0.0015)), ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });
  viewport.addEventListener("click", ev => {
    const add = ev.target.closest(".addf");
    if (add && isEditing()) addField(add.closest(".ent").dataset.id);
  });
  viewport.addEventListener("dblclick", onDoubleClick);
  viewport.addEventListener("change", ev => {
    const box = ev.target.closest("input.rv");
    if (box && isEditing()) setReviewed(box.closest(".ent").dataset.id, box.checked);
  });
  viewport.addEventListener("keydown", ev => {
    const ent = ev.target.closest && ev.target.closest(".ent");
    if (ent && ev.key === "Enter" && ev.target === ent) select({ kind: "entity", id: ent.dataset.id });
    const moduleBox = ev.target.closest && ev.target.closest(".mod");
    if (moduleBox && ev.key === "Enter" && ev.target === moduleBox) select({ kind: "module", id: moduleBox.dataset.module });
  });
}
