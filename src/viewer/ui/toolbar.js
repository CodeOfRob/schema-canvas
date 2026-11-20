// Page chrome around the canvas: header counts, toolbar state, menus, kind filter, enums, keyboard, full screen.
import { normalizeModel, toDocument } from "../../model/normalize.js";
import { normalizeLayout } from "../../model/page-data.js";
import { declaresLayers } from "../module-graph.js";
import { saveJsonFile, pickJsonFile } from "../storage.js";
import { S, STATUS_LABEL } from "../strings.js";
import { applyTransform, clearMultiSelection, drawLinks, fitAll, renderCanvas, setZoom } from "./canvas.js";
import { addGroup, addTable, arrange, clearModulePositions, commit, isForceSpacingLive, placeMissing, restoreArrangement, select, setForceSpacing, setModuleView, setView, startGrouping, startLinking, toggleLineType, undo } from "./actions.js";
import { SPACING_RANGE } from "../layout-force.js";
import { esc } from "./html.js";
import { moduleLegendHtml } from "./module-marks.js";
import { view } from "./view.js";
import { UNASSIGNED } from "../../model/page-data.js";
import { state, activeModel, axisClass, axisKeys, axisSpec, hasOpaqueRelations, hasTarget, isEditing, otherModel, savePref, saveTileDisplays, switchableLineTypes } from "./state.js";

const $ = id => document.getElementById(id);

export function flash(message) {
  $("savestate").textContent = message;
}

function countsText(model, viewName) {
  return S.counts(viewName, model.entities.length, model.relations.length, model.indexes.length);
}

function renderTileList() {
  const names = [...state.tileDisplays.keys()].sort();
  const text = name => (state.tileDisplays.get(name) === "badge" ? S.tileListBadge(name) : name);
  $("tile-list").innerHTML = '<span class="muted">' + esc(S.tileListLabel) + "</span> " + (names.length
    ? names.map(n => '<button class="chipbtn" type="button" data-untile="' + esc(n) + '" title="' + esc(S.untile(n)) + '">' + esc(text(n)) + " ×</button>").join(" ")
    : '<span class="muted">' + esc(S.tileListEmpty) + "</span>");
}

function renderEnums() {
  const enums = activeModel().enums;
  $("enums").innerHTML = enums.length
    ? enums.map(e => '<table class="enum"><thead><tr><th>' + esc(e.name) + "</th></tr></thead><tbody>" + e.values.map(v => "<tr><td>" + esc(v) + "</td></tr>").join("") + "</tbody></table>").join("")
    : '<p class="muted">' + esc(S.enumsEmpty) + "</p>";
}

/** Brings every toolbar control in line with the state (cheap; called after each refresh). */
export function renderChrome() {
  const editing = isEditing(), modules = state.moduleView;
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
  // The module view shows no table edits: those and the table arrangements pause while it is shown.
  // Its boxes are dragged and saved; "Arrange" there forgets the dragged positions.
  document.querySelectorAll(".edit-only").forEach(el => { el.hidden = !editing || modules; });
  document.querySelectorAll(".table-view-only").forEach(el => { el.disabled = modules; });
  const arrangeRel = $("arrange-rel");
  arrangeRel.disabled = modules && !Object.keys(state.layout.modules).length;
  arrangeRel.title = !modules ? S.arrangeByRelationsTitle : declaresLayers(state.page.config.modules) ? S.arrangeModulesLayeredTitle : S.arrangeModulesTitle;
  $("module-view").setAttribute("aria-pressed", String(modules));
  // Opaque references: legend entry only when a model has any (an imported target may add or drop them).
  const opaque = hasOpaqueRelations();
  $("legend").hidden = !hasTarget() && !opaque;
  $("legend-opaque").hidden = !opaque;
  // Module colour keys: table view only (the module view's boxes carry the module themselves).
  $("module-legend").hidden = modules || !axisKeys("module").length;
  $("module-areas-toggle").setAttribute("aria-pressed", String(state.showModuleAreas));
  renderLineToggles();
  renderForceSpacing();
  // The data-kind filter acts on tables only, which the module view does not draw. The module filter stays: it hides
  // modules in the module view and their tables in the table view (docs/config.md: "both views").
  $("kind-filter").hidden = !axisKeys("kind").length || modules;
  $("undo").disabled = !state.undo.length;
  $("add-rel").setAttribute("aria-pressed", String(state.linking));
  $("add-group").setAttribute("aria-pressed", String(!!state.grouping));
  $("viewport").classList.toggle("linking", state.linking);
  $("hint").textContent = state.linking ? (state.linkFrom ? S.hintLinkSecond : S.hintLinkFirst) : state.grouping ? S.hintGrouping : "";
  $("layout-restore").hidden = !state.arrangedFrom[state.view] || modules;
  const other = otherModel();
  const viewName = state.view === "target" ? S.viewTarget : S.viewCurrent;
  $("counts").textContent = countsText(activeModel(), hasTarget() ? viewName : S.summaryTables) + (other ? " (" + countsText(other, state.view === "target" ? S.viewCurrent : S.viewTarget) + ")" : "");
  renderTileList();
  renderEnums();
  if (hasTarget()) {
    const reviewed = state.target.entities.filter(e => e.reviewed).length;
    $("reviewed-count").textContent = reviewed + "/" + state.target.entities.length;
    $("dim-reviewed").setAttribute("aria-pressed", String(state.dimReviewed));
    $("dim-reviewed").disabled = !editing || modules;
  }
}

/** The spacing slider: its value, and whether moving it re-arranges the shown layout now (live) or only later (idle). */
function renderForceSpacing() {
  const live = isForceSpacingLive();
  $("force-spacing").value = state.forceSpacing;
  $("force-spacing-val").textContent = S.forceSpacingValue(state.forceSpacing);
  $("force-spacing-ctl").classList.toggle("idle", !live);
  $("force-spacing-ctl").title = live ? S.forceSpacingTitle : S.forceSpacingIdleTitle;
}

function bindForceSpacing() {
  const input = $("force-spacing");
  Object.assign(input, { min: SPACING_RANGE.min, max: SPACING_RANGE.max, step: SPACING_RANGE.step });
  input.setAttribute("aria-label", S.forceSpacing);
  const value = () => Number(input.value);
  input.addEventListener("input", () => { $("force-spacing-val").textContent = S.forceSpacingValue(value()); setForceSpacing(value(), false); });
  input.addEventListener("change", () => setForceSpacing(value(), true));
}

/** Legend entries as line switches: pressed = drawn; an entry that does not act in this view is marked inert. */
function renderLineToggles() {
  const switchable = switchableLineTypes();
  document.querySelectorAll("#legend [data-line]").forEach(button => {
    const type = button.dataset.line, active = switchable.includes(type);
    button.setAttribute("aria-pressed", String(!state.hiddenLines.has(type)));
    button.disabled = !active;
    button.title = active ? S.lineToggleTitle : S.lineToggleTableViewOnly;
  });
}

function setFullscreen(on, fromBrowser) {
  const stage = $("stage"), button = $("full");
  stage.classList.toggle("full", on);
  button.setAttribute("aria-pressed", String(on));
  button.textContent = on ? S.fullscreenExit : S.fullscreen;
  if (!fromBrowser) {
    try {
      if (on && stage.requestFullscreen && !document.fullscreenElement) stage.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* the browser refused full screen; the CSS full-window mode still applies */ }
  }
  requestAnimationFrame(fitAll);
}

// Filter buttons of one classification axis; UNASSIGNED stands for the tables without a value.
const FILTERS = {
  kind: { host: "kind-filter", pref: "hidden-kinds", none: () => S.kindNone, title: label => S.kindFilterTitle(label) },
  module: { host: "module-filter", pref: "hidden-modules", none: () => S.moduleNone, title: label => S.moduleFilterTitle(label) },
};

function buildFilter(axisName) {
  const filter = FILTERS[axisName], host = $(filter.host), keys = axisKeys(axisName), hidden = state.hidden[axisName];
  host.hidden = !keys.length;
  if (!keys.length) return;
  const buttons = [...keys.map(k => ({ key: k, cls: axisClass(axisName, k), ...axisSpec(axisName, k) })), { key: UNASSIGNED, cls: axisName === "kind" ? "k-none" : "m-none", label: filter.none() }];
  host.innerHTML = buttons.map(b => '<button type="button" class="filterbtn ' + b.cls + '" data-key="' + esc(b.key) + '" title="' + esc((b.description ? b.description + ". " : "") + filter.title(b.label)) + '" aria-pressed="' + !hidden.has(b.key) + '">' + esc(b.label) + "</button>").join("");
  host.addEventListener("click", ev => {
    const b = ev.target.closest("button[data-key]");
    if (!b) return;
    const k = b.dataset.key;
    if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
    b.setAttribute("aria-pressed", String(!hidden.has(k)));
    savePref(filter.pref, hidden);
    renderCanvas();
    if (state.moduleView) view.renderPanel();
  });
}

function buildKindControls() {
  const kinds = axisKeys("kind").length > 0;
  $("arrange").hidden = !kinds;
  $("zone-gap-ctl").hidden = !kinds;
  buildFilter("kind");
}

function bindSlider(inputId, outputId, stateKey, prefName, after) {
  const input = $(inputId), output = $(outputId);
  input.value = state[stateKey];
  output.textContent = state[stateKey] + " px";
  input.addEventListener("input", () => {
    state[stateKey] = Number(input.value);
    output.textContent = state[stateKey] + " px";
    savePref(prefName, state[stateKey]);
    if (after) after();
  });
}

function bindMenus() {
  document.addEventListener("click", ev => { document.querySelectorAll("details.menu[open]").forEach(d => { if (!d.contains(ev.target)) d.open = false; }); });
  // Place an opened menu's popup under its button (fixed, so the scrolling toolbar cannot clip it).
  const place = d => {
    const r = d.querySelector("summary").getBoundingClientRect(), pop = d.querySelector(".pop");
    const w = pop.offsetWidth;
    const left = d.classList.contains("right") ? r.right - w : r.left;
    pop.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + "px";
    pop.style.top = r.bottom + 6 + "px";
  };
  document.querySelectorAll("details.menu").forEach(d => d.addEventListener("toggle", () => {
    if (!d.open) return;
    document.querySelectorAll("details.menu[open]").forEach(o => { if (o !== d) o.open = false; });
    place(d);
  }));
  const placeOpen = () => document.querySelectorAll("details.menu[open]").forEach(place);
  document.querySelector(".toolbar").addEventListener("scroll", placeOpen);
  window.addEventListener("resize", placeOpen);
}

function fileBaseName() {
  return (state.page.config.title || state.current.name || "schema").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "schema";
}

async function importFile(apply) {
  try {
    const { name, data } = await pickJsonFile();
    apply(data, name);
    flash(S.imported(name));
  } catch (error) {
    flash(S.importFailed(error.message.split("\n")[0]));
    console.error(error);
  }
}

async function exportFile(name, getData) {
  try {
    await saveJsonFile(name, getData());
    flash(S.exported(name));
  } catch (error) {
    flash(S.exportFailed(name));
    console.error(error);
  }
}

function bindFileActions() {
  $("export-target").addEventListener("click", () => exportFile(fileBaseName() + ".target.model.json", () => toDocument(state.target)));
  $("export-layout").addEventListener("click", () => exportFile(fileBaseName() + ".layout.json", () => state.layout));
  $("import-target").addEventListener("click", () => importFile((data, name) => {
    const model = normalizeModel(data, name);
    state.sel = null;
    commit(s => { s.target = model; placeMissing("target"); });
  }));
  $("import-layout").addEventListener("click", () => importFile((data, name) => {
    const layout = normalizeLayout(data, name);
    commit(s => { s.layout = layout; placeMissing("current"); placeMissing("target"); });
    fitAll();
  }));
  const reset = $("reset");
  const label = hasTarget() ? S.resetTarget : S.resetLayout;
  reset.textContent = label;
  reset.addEventListener("click", () => {
    if (reset.dataset.armed !== "1") {
      reset.dataset.armed = "1";
      reset.textContent = S.resetConfirm;
      setTimeout(() => { reset.dataset.armed = ""; reset.textContent = label; }, 4000);
      return;
    }
    reset.dataset.armed = ""; reset.textContent = label;
    state.sel = null;
    commit(s => {
      s.target = s.page.target ? JSON.parse(JSON.stringify(s.page.target)) : null;
      s.layout = JSON.parse(JSON.stringify(s.page.layout));
      placeMissing("current");
      placeMissing("target");
    });
    fitAll();
    flash(S.resetDone);
  });
}

function bindKeyboard() {
  document.addEventListener("keydown", ev => {
    if (ev.target.closest && ev.target.closest("input, textarea, select")) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && isEditing()) { ev.preventDefault(); undo(); }
    if (ev.key === "Escape") {
      if (clearMultiSelection()) return;
      if (state.linking) startLinking(false);
      else if (state.grouping) startGrouping(null);
      else if (state.sel) select(null);
      else if ($("stage").classList.contains("full")) setFullscreen(false);
    }
    const step = 60;
    const arrows = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (arrows[ev.key]) { ev.preventDefault(); state.pan = { x: state.pan.x + arrows[ev.key][0], y: state.pan.y + arrows[ev.key][1] }; applyTransform(); }
  });
}

// The template carries string keys only (data-s, data-s-title, data-s-label); the words live in strings.js.
function applyStaticStrings() {
  const lookup = key => {
    const value = key.startsWith("status.") ? STATUS_LABEL[key.slice(7)] : S[key];
    if (typeof value !== "string") throw new Error("schema-canvas: unknown string key " + key);
    return value;
  };
  document.querySelectorAll("[data-s]").forEach(el => { el.textContent = lookup(el.dataset.s); });
  document.querySelectorAll("[data-s-title]").forEach(el => { el.title = lookup(el.dataset.sTitle); });
  document.querySelectorAll("[data-s-label]").forEach(el => { el.setAttribute("aria-label", lookup(el.dataset.sLabel)); });
}

export function initToolbar() {
  applyStaticStrings();
  const title = state.page.config.title || (state.target && state.target.name) || state.current.name || S.defaultTitle;
  document.title = title;
  $("title").textContent = title;
  $("tabs").hidden = !hasTarget();
  document.querySelectorAll(".target-only").forEach(el => { el.hidden = !hasTarget(); });
  $("module-legend-keys").innerHTML = moduleLegendHtml();
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  $("add-table").addEventListener("click", addTable);
  $("add-rel").addEventListener("click", () => startLinking());
  $("add-group").addEventListener("click", addGroup);
  $("undo").addEventListener("click", undo);
  $("zoom-in").addEventListener("click", () => setZoom(state.zoom * 1.15));
  $("zoom-out").addEventListener("click", () => setZoom(state.zoom / 1.15));
  $("fit").addEventListener("click", fitAll);
  $("arrange").addEventListener("click", () => arrange("kind"));
  $("arrange-rel").addEventListener("click", () => (state.moduleView ? clearModulePositions() : arrange("relations")));
  $("arrange-radial").addEventListener("click", () => arrange("radial"));
  $("arrange-forces").addEventListener("click", () => arrange("forces"));
  $("layout-restore").addEventListener("click", restoreArrangement);
  $("full").addEventListener("click", () => setFullscreen(!$("stage").classList.contains("full")));
  $("module-areas-toggle").addEventListener("click", () => {
    state.showModuleAreas = !state.showModuleAreas;
    savePref("module-areas", state.showModuleAreas);
    renderChrome();
    drawLinks();
  });
  $("dim-reviewed").addEventListener("click", () => {
    state.dimReviewed = !state.dimReviewed;
    savePref("dim-reviewed", state.dimReviewed);
    renderChrome();
    renderCanvas();
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && $("stage").classList.contains("full")) setFullscreen(false, true); });
  const indexButton = $("idx");
  indexButton.setAttribute("aria-pressed", String(state.showIndexes));
  indexButton.addEventListener("click", () => {
    state.showIndexes = !state.showIndexes;
    savePref("show-indexes", state.showIndexes);
    indexButton.setAttribute("aria-pressed", String(state.showIndexes));
    renderCanvas();
  });
  $("tile-list").addEventListener("click", ev => {
    const x = ev.target.closest("[data-untile]");
    if (!x) return;
    state.tileDisplays.delete(x.dataset.untile);
    saveTileDisplays();
    renderTileList();
    renderCanvas();
    if (state.sel || state.moduleView) view.renderPanel();
  });
  $("module-view").hidden = !axisKeys("module").length;
  $("legend").addEventListener("click", ev => {
    const button = ev.target.closest("[data-line]");
    if (button && !button.disabled) toggleLineType(button.dataset.line);
  });
  $("module-view").addEventListener("click", () => setModuleView(!state.moduleView));
  bindSlider("zone-gap", "zone-gap-val", "zoneGap", "zone-gap", drawLinks);
  bindForceSpacing();
  bindSlider("group-join", "group-join-val", "groupJoin", "group-join");
  buildKindControls();
  buildFilter("module");
  bindMenus();
  bindFileActions();
  bindKeyboard();
  // Size the canvas to the window below the header.
  const fitChrome = () => {
    if ($("stage").classList.contains("full")) return;
    const top = $("viewport").getBoundingClientRect().top + window.scrollY;
    document.documentElement.style.setProperty("--chrome", Math.round(top + 10) + "px");
  };
  fitChrome();
  window.addEventListener("resize", () => { fitChrome(); applyTransform(); });
}
