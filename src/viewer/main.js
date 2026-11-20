// Entry point of the bundled page script.
import { PAGE_DATA_GLOBAL, loadPageData, storageKeyFor } from "./model.js";
import { S, applyStringOverrides } from "./strings.js";
import { placeMissing, refresh } from "./ui/actions.js";
import { boxOf, centerOn, fitAll, initCanvas, previewPositions, renderCanvas, viewportSize, worldPointAt } from "./ui/canvas.js";
import { initInspector, renderPanel } from "./ui/inspector.js";
import { renderPageText } from "./ui/sections.js";
import { applyLocalSnapshot, initPersistence } from "./ui/persistence.js";
import { flash, initToolbar, renderChrome } from "./ui/toolbar.js";
import { state, loadPrefs } from "./ui/state.js";
import { bindView } from "./ui/view.js";
import { fingerprintModel } from "./snapshot-base.js";

const PALETTE = ["#0060a3", "#a86400", "#54606d", "#7a3e9d", "#00796b", "#b0306a"];

// Axis classes are k-0, k-1, ... (data kinds) and m-0, m-1, ... (modules): keys are user text, so they never reach CSS directly.
function injectAxisStyles({ dataKinds, modules }) {
  const color = (spec, i) => spec.color || PALETTE[i % PALETTE.length];
  const kindRules = Object.values(dataKinds).map((spec, i) =>
    ".ent.k-" + i + " { border-left: 5px solid " + color(spec, i) + "; }\n" +
    ".zone.k-" + i + " { border-color: " + color(spec, i) + "; background: color-mix(in srgb, " + color(spec, i) + " 9%, transparent); }\n" +
    ".zone.k-" + i + " .zl { background: " + color(spec, i) + "; }\n" +
    "button.filterbtn.k-" + i + "::before { background: " + color(spec, i) + "; }");
  const moduleRules = Object.values(modules).map((spec, i) =>
    ".mod.m-" + i + " { border-left: 6px solid " + color(spec, i) + "; }\n" +
    "button.filterbtn.m-" + i + "::before, .ent .mtag.m-" + i + "::before, .mkey.m-" + i + "::before { background: " + color(spec, i) + "; }\n" +
    ".ent .mtag.m-" + i + " { border-color: color-mix(in srgb, " + color(spec, i) + " 60%, var(--line)); }\n" +
    "svg.mareas path.m-" + i + " { fill: " + color(spec, i) + "; stroke: " + color(spec, i) + "; }");
  const style = document.createElement("style");
  style.textContent = [...kindRules, ...moduleRules].join("\n");
  document.head.appendChild(style);
}

function showFatal(error) {
  console.error(error);
  const el = document.getElementById("fatal");
  el.hidden = false;
  el.textContent = S.dataError + ": " + error.message;
}

async function main() {
  let page;
  try {
    page = loadPageData(window[PAGE_DATA_GLOBAL]);
    applyStringOverrides(page.config.strings);
  } catch (error) { showFatal(error); return; }
  if (page.config.language) document.documentElement.lang = page.config.language;
  bindView({ renderCanvas, renderPanel, renderChrome, flash, boxOf, fitAll, centerOn, viewportSize, worldPointAt, previewPositions });
  state.page = page;
  state.current = page.current;
  state.target = page.target ? structuredClone(page.target) : null;
  state.builtInBase = fingerprintModel(page.target);
  state.base = state.builtInBase;
  state.layout = structuredClone(page.layout);
  state.view = page.target ? "target" : "current";
  loadPrefs(storageKeyFor(page.config, page.current), page.config);
  injectAxisStyles(page.config);
  const localSnapshot = applyLocalSnapshot();
  placeMissing("current");
  placeMissing("target");
  initCanvas();
  initInspector();
  initToolbar();
  renderPageText(page.config);
  refresh();
  fitAll();
  await initPersistence(localSnapshot);
}

main().catch(showFatal);
