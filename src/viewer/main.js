// Entry point of the bundled page script.
import { PAGE_DATA_GLOBAL, loadPageData, storageKeyFor } from "./model.js";
import { S } from "./strings.js";
import { placeMissing, refresh } from "./ui/actions.js";
import { boxOf, centerOn, fitAll, initCanvas, renderCanvas, viewportSize, worldPointAt } from "./ui/canvas.js";
import { initInspector, renderPanel } from "./ui/inspector.js";
import { applyLocalSnapshot, initPersistence } from "./ui/persistence.js";
import { flash, initToolbar, renderChrome } from "./ui/toolbar.js";
import { state, loadPrefs } from "./ui/state.js";
import { bindView } from "./ui/view.js";

const PALETTE = ["#0060a3", "#a86400", "#54606d", "#7a3e9d", "#00796b", "#b0306a"];

// Kind classes are k-0, k-1, ... (kind keys are user text, so they never reach CSS directly).
function injectKindStyles(dataKinds) {
  const rules = Object.values(dataKinds).map((spec, i) => {
    const color = spec.color || PALETTE[i % PALETTE.length];
    return ".ent.k-" + i + " { border-left: 5px solid " + color + "; }\n" +
      ".zone.k-" + i + " { border-color: " + color + "; background: color-mix(in srgb, " + color + " 9%, transparent); }\n" +
      ".zone.k-" + i + " .zl { background: " + color + "; }\n" +
      "button.kind.k-" + i + "::before { background: " + color + "; }";
  });
  const style = document.createElement("style");
  style.textContent = rules.join("\n");
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
  try { page = loadPageData(window[PAGE_DATA_GLOBAL]); } catch (error) { showFatal(error); return; }
  bindView({ renderCanvas, renderPanel, renderChrome, flash, boxOf, fitAll, centerOn, viewportSize, worldPointAt });
  state.page = page;
  state.current = page.current;
  state.target = page.target ? structuredClone(page.target) : null;
  state.layout = structuredClone(page.layout);
  state.view = page.target ? "target" : "current";
  loadPrefs(storageKeyFor(page.config, page.current), page.config);
  injectKindStyles(page.config.dataKinds);
  const localSavedAt = applyLocalSnapshot();
  placeMissing("current");
  placeMissing("target");
  initCanvas();
  initInspector();
  initToolbar();
  refresh();
  fitAll();
  await initPersistence(localSavedAt);
}

main().catch(showFatal);
