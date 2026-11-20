import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeModel } from "../src/model/normalize.js";
import { normalizeConfig, normalizeLayout } from "../src/model/page-data.js";
import { arrange } from "../src/viewer/ui/actions.js";
import { state } from "../src/viewer/ui/state.js";
import { bindView } from "../src/viewer/ui/view.js";

// The "Arrange" action on the example page's current model, without a browser: the view functions are stubs and
// boxes fall back to the estimated sizes (boxOf returns nothing).
const read = name => JSON.parse(readFileSync(new URL("../examples/bookshop/" + name, import.meta.url), "utf8"));
const noop = () => {};
bindView({ renderCanvas: noop, renderPanel: noop, renderChrome: noop, flash: noop, boxOf: () => null, fitAll: noop, centerOn: noop, viewportSize: () => ({ width: 1000, height: 800 }), worldPointAt: () => [0, 0], previewPositions: noop });

function loadExample() {
  Object.assign(state, {
    page: { config: normalizeConfig(read("config.json")) },
    current: normalizeModel(read("current.model.json")), target: null, view: "current",
    layout: normalizeLayout(read("layout.json")), undo: [], sel: null, arrangedFrom: { current: null, target: null },
  });
}
async function arrangeStar() {
  arrange("radial");
  await new Promise(resolve => setTimeout(resolve, 60));
  return structuredClone(state.layout.current);
}

test("Arrange as a star: a selected table does not change the result", async () => {
  loadExample();
  const withoutSelection = await arrangeStar();
  for (const entity of state.current.entities) {
    loadExample();
    state.sel = { kind: "entity", id: entity.id };
    assert.deepEqual(await arrangeStar(), withoutSelection, "selected " + entity.name);
  }
});

// The force arrangement animates; the test runs it with "reduce motion" (the final layout applies at once).
function recordViewCalls() {
  const calls = [];
  bindView({ renderCanvas: noop, renderPanel: noop, renderChrome: noop, flash: noop, boxOf: () => null, fitAll: () => calls.push(["fitAll"]), centerOn: noop, viewportSize: () => ({ width: 1000, height: 800 }), worldPointAt: () => [0, 0], previewPositions: pos => calls.push(["preview", structuredClone(pos)]) });
  return calls;
}
globalThis.window = { matchMedia: () => ({ matches: true }), addEventListener: noop, removeEventListener: noop };

test("Arrange by forces: the view is fitted to the result, then the tables are shown at their start again", async () => {
  loadExample();
  const calls = recordViewCalls(), start = structuredClone(state.layout.current);
  arrange("forces");
  await new Promise(resolve => setTimeout(resolve, 60));
  const fit = calls.findIndex(call => call[0] === "fitAll");
  assert.ok(fit > 0, "fitted after a preview");
  assert.deepEqual(calls[fit - 1][1], state.layout.current, "fitted to the final layout");
  const startShown = calls[fit + 1];
  assert.ok(startShown && startShown[0] === "preview", "a preview follows the fit");
  const shownIds = Object.keys(startShown[1]);
  assert.deepEqual(startShown[1], Object.fromEntries(shownIds.map(id => [id, start[id]])), "the animation starts from the current positions");
});
