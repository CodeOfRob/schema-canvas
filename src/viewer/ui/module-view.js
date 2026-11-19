// Module view: one box per module and one arrow per direction between modules (module-graph.js), drawn into the
// canvas world instead of the tables, plus its inspector panels. Schema (FK) coupling only.
import { UNASSIGNED } from "../../model/page-data.js";
import { boxBorderPoint } from "../geometry.js";
import { placeModules } from "../layout.js";
import { buildModuleGraph } from "../module-graph.js";
import { S } from "../strings.js";
import { select, setModuleView } from "./actions.js";
import { esc } from "./html.js";
import { state, activeModel, axisClass, axisSpec, entityById, moduleOf, tileOf } from "./state.js";
import { view } from "./view.js";

const MODULE_BOX = { w: 220, h: 92 };
// Positions come from layout.modules (saved by dragging, ONE map for both tabs: buildModuleGraph returns all configured
// modules in both views, so shared positions keep the comparison stable); modules without one are derived (placeModules).

/** The module graph of the shown model without the modules switched off in the module filter. */
function shownModuleGraph() {
  const model = activeModel();
  const graph = buildModuleGraph(model, { modules: state.page.config.modules, moduleOf, tileOf: r => tileOf(model, r) });
  const visible = key => !state.hidden.module.has(key);
  return { ...graph, nodes: graph.nodes.filter(n => visible(n.key)), edges: graph.edges.filter(e => visible(e.from) && visible(e.to)) };
}

function moduleLabel(node) {
  return node.unassigned ? S.moduleNone : node.label;
}

function moduleBoxHtml(node) {
  const hidden = node.hiddenRelationCount ? '<span class="mhid" title="' + esc(S.moduleHiddenText(node.hiddenRelationCount)) + '">' + esc(S.moduleHidden(node.hiddenRelationCount)) + "</span>" : "";
  return '<div class="mh"><span class="en">' + esc(moduleLabel(node)) + "</span>" + hidden + '</div><div class="mb">' + esc(S.moduleTables(node.tableCount)) + "<br>" + esc(S.moduleInternal(node.internalRelationCount)) + "</div>";
}

/** Replaces the canvas content with the module boxes and their arrows. */
export function renderModuleCanvas(world, links) {
  const graph = shownModuleGraph(), pos = placeModules(graph.nodes, graph.edges, state.layout.modules, MODULE_BOX);
  world.querySelectorAll(".ent, .zone, .mod").forEach(n => n.remove());
  const frag = document.createDocumentFragment();
  for (const node of graph.nodes) {
    const el = document.createElement("div");
    const selected = state.sel && state.sel.kind === "module" && state.sel.id === node.key;
    el.className = "mod" + (node.unassigned ? " m-none" : " " + axisClass("module", node.key)) + (selected ? " sel" : "");
    el.style.left = pos[node.key][0] + "px"; el.style.top = pos[node.key][1] + "px";
    el.dataset.module = node.key;
    el.tabIndex = 0;
    el.innerHTML = moduleBoxHtml(node);
    frag.appendChild(el);
  }
  world.appendChild(frag);
  drawModuleEdges(world, links, graph);
}

const ARROW_MARKERS = '<defs><marker id="m-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>' +
  '<marker id="m-arrow-viol" class="viol" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker></defs>';

function violationText(edge) {
  if (edge.violation === "cycle") return S.violationCycle;
  if (edge.violation === "not-allowed") {
    // Non-transitive module: say why a module further down the dependency chain is refused.
    const directOnly = (axisSpec("module", edge.from) || {}).transitive === false;
    return (directOnly ? S.violationNotDirect : S.violationNotAllowed)(moduleName(edge.from), moduleName(edge.to));
  }
  return "";
}

const edgeTitle = edge => (edge.kind === "opaque" ? S.moduleEdgeTitleOpaque : S.moduleEdgeTitle)(moduleName(edge.from), moduleName(edge.to));
const edgeCount = edge => (edge.kind === "opaque" ? S.moduleEdgeCountOpaque : S.moduleEdgeCount)(edge.relations.length);

function moduleName(key) {
  return key === UNASSIGNED ? S.moduleNone : (axisSpec("module", key) || { label: key }).label;
}

export function drawModuleEdges(world, links, graph = shownModuleGraph()) {
  const boxOf = key => {
    const el = world.querySelector('.mod[data-module="' + CSS.escape(key) + '"]');
    return el && { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };
  let out = ARROW_MARKERS;
  for (const edge of graph.edges) {
    const a = boxOf(edge.from), b = boxOf(edge.to);
    if (!a || !b) continue;
    const pa = boxBorderPoint(a, b.x + b.w / 2, b.y + b.h / 2), pb = boxBorderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1, nx = -(pb.y - pa.y) / len, ny = (pb.x - pa.x) / len;
    // Several arrows between the same two modules (both directions, foreign keys plus opaque): spread them side by side
    // so they do not cover each other. The normal flips with the direction, so the slot is measured in a fixed frame.
    const pair = graph.edges.filter(o => (o.from === edge.from && o.to === edge.to) || (o.from === edge.to && o.to === edge.from));
    const slot = pair.indexOf(edge) - (pair.length - 1) / 2;
    const shift = slot * 18 * (edge.from < edge.to ? 1 : -1);
    const x1 = pa.x + nx * shift, y1 = pa.y + ny * shift, x2 = pb.x + nx * shift, y2 = pb.y + ny * shift;
    const viol = (edge.violation ? " viol" : "") + (edge.kind === "opaque" ? " opaque" : "");
    const selected = state.sel && state.sel.kind === "module-edge" && state.sel.id === edge.key;
    out += '<line class="medge-line' + viol + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#m-arrow' + (edge.violation ? "-viol" : "") + ')" />';
    const text = String(edge.relations.length), w = Math.max(24, text.length * 7 + 14), lx = (x1 + x2) / 2 + nx * shift, ly = (y1 + y2) / 2 + ny * shift;
    const title = edgeTitle(edge) + ": " + edgeCount(edge) + (edge.violation ? ". " + violationText(edge) : "");
    out += '<g class="lbl medge' + viol + (selected ? " sel" : "") + '" data-edge="' + esc(edge.key) + '"><title>' + esc(title) + '</title><rect x="' + (lx - w / 2) + '" y="' + (ly - 9) + '" width="' + w + '" height="18" rx="9" /><text x="' + lx + '" y="' + (ly + 4) + '" text-anchor="middle">' + esc(text) + "</text></g>";
  }
  links.innerHTML = out;
}

// ---------- inspector panels ----------
function relationText(id) {
  const r = activeModel().relations.find(x => x.id === id);
  const name = eid => (entityById(eid) || {}).name || "?";
  return { id, from: r.from, text: name(r.from) + (r.fromFields.length ? "." + r.fromFields.join(", ") : "") + " → " + name(r.to) };
}

function items(list) {
  return '<div class="items">' + list.map(i => '<div class="item" tabindex="0" ' + i.attr + '><span class="nm' + (i.viol ? " viol" : "") + '">' + esc(i.name) + '</span><span class="meta">' + esc(i.meta || "") + "</span></div>").join("") + "</div>";
}

function edgeItem(edge) {
  return { attr: 'data-edge="' + esc(edge.key) + '"', name: edgeTitle(edge), meta: String(edge.relations.length), viol: !!edge.violation };
}

function summaryHtml(graph) {
  let html = "<section><h3>" + S.moduleHelpTitle + '</h3><p class="muted">' + S.moduleHelp + "</p><p class=\"muted\">" + (graph.layered ? S.moduleRulesLegend : S.moduleRulesNone) + "</p></section>";
  if (graph.layered) {
    const violations = graph.edges.filter(e => e.violation);
    html += "<section><h3>" + S.moduleViolations + " (" + violations.length + ")</h3>" + (violations.length ? items(violations.map(edgeItem)) : '<p class="muted">' + S.moduleViolationsNone + "</p>") + "</section>";
  }
  html += "<section><h3>" + S.moduleList + " (" + graph.nodes.length + ")</h3>" + items(graph.nodes.map(n => ({ attr: 'data-module="' + esc(n.key) + '"', name: moduleLabel(n), meta: S.moduleTables(n.tableCount) }))) + "</section>";
  return html;
}

function moduleHtml(graph, key) {
  const node = graph.nodes.find(n => n.key === key);
  if (!node) return null;
  const spec = axisSpec("module", key);
  let html = '<section><button class="linkbtn" id="p-back" type="button">' + S.backToModules + '</button><div class="row"><h2>' + esc(moduleLabel(node)) + "</h2></div>";
  if (spec && spec.description) html += '<div class="note">' + esc(spec.description) + "</div>";
  if (spec) {
    const deps = spec.dependsOn;
    html += '<span class="muted">' + S.moduleDependsOn + ": " + esc(deps === undefined ? S.moduleDependsOnUndeclared : deps.length ? deps.map(moduleName).join(", ") : S.moduleDependsOnNothing) + "</span>";
    if (spec.transitive === false) html += '<span class="muted">' + S.moduleDependsOnDirectOnly + "</span>";
  }
  html += '<span class="muted">' + esc(S.moduleInternal(node.internalRelationCount)) + (node.hiddenRelationCount ? " · " + esc(S.moduleHiddenText(node.hiddenRelationCount)) : "") + "</span></section>";
  const touching = graph.edges.filter(e => e.from === key || e.to === key);
  if (touching.length) html += "<section><h3>" + S.moduleCoupling + "</h3>" + items(touching.map(edgeItem)) + "</section>";
  html += "<section><h3>" + S.groupTables + " (" + node.tableCount + ")</h3>" + items(node.entityIds.map(id => ({ attr: 'data-eid="' + esc(id) + '"', name: entityById(id).name }))) + "</section>";
  return html;
}

function edgeHtml(graph, key) {
  const edge = graph.edges.find(e => e.key === key);
  if (!edge) return null;
  let html = '<section><button class="linkbtn" id="p-back" type="button">' + S.backToModules + '</button><div class="row"><h2>' + esc(edgeTitle(edge)) + "</h2></div>";
  html += '<span class="muted">' + esc(edgeCount(edge)) + "</span>";
  if (edge.violation) html += '<div class="note viol">' + esc(violationText(edge)) + "</div>";
  if (edge.kind === "opaque") html += '<div class="note">' + esc(S.moduleOpaqueNote) + "</div>";
  html += "</section><section><h3>" + (edge.kind === "opaque" ? S.moduleEdgeRelationsOpaque : S.moduleEdgeRelations) + "</h3>" + items(edge.relations.map(relationText).map(r => ({ attr: 'data-rid="' + esc(r.id) + '" data-eid="' + esc(r.from) + '"', name: r.text }))) + "</section>";
  return html;
}

/** Leaves the module view and opens a table or relation in the table canvas. */
function openInTables(sel, centreId) {
  setModuleView(false);
  select(sel);
  view.centerOn(centreId);
}

function bindPanel(panel) {
  const back = panel.querySelector("#p-back");
  if (back) back.addEventListener("click", () => select(null));
  panel.querySelectorAll(".item").forEach(el => {
    const go = () => {
      const d = el.dataset;
      if (d.rid) openInTables({ kind: "rel", id: d.rid }, d.eid);
      else if (d.eid) openInTables({ kind: "entity", id: d.eid }, d.eid);
      else if (d.edge) select({ kind: "module-edge", id: d.edge });
      else if (d.module) select({ kind: "module", id: d.module });
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", ev => { if (ev.key === "Enter") go(); });
  });
}

/** Inspector content while the module view is shown: summary, one module, or one arrow. */
export function renderModulePanel(panel) {
  const graph = shownModuleGraph(), s = state.sel;
  let html = s && s.kind === "module" ? moduleHtml(graph, s.id) : s && s.kind === "module-edge" ? edgeHtml(graph, s.id) : null;
  if (!html) { state.sel = null; html = summaryHtml(graph); }
  panel.innerHTML = html;
  bindPanel(panel);
}
