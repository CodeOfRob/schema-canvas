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
