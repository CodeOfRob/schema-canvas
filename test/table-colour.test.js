import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeConfig } from "../src/model/page-data.js";
import { legendKeysHtml } from "../src/viewer/ui/module-marks.js";
import { canChooseTableColour, state, tableColourAxis } from "../src/viewer/ui/state.js";

// "Colour tables by": data kind (default, today's behaviour) or module; only a page with both axes offers the choice.
const read = name => JSON.parse(readFileSync(new URL("../examples/bookshop/" + name, import.meta.url), "utf8"));
function useConfig(change = raw => raw) { state.page = { config: normalizeConfig(change(read("config.json"))) }; }
const withoutModules = raw => { delete raw.modules; delete raw.entityModules; return raw; };
const withoutKinds = raw => { delete raw.dataKinds; delete raw.entityKinds; return raw; };

test("the default colours tables by data kind", () => {
  useConfig();
  state.tableColour = "kind";
  assert.equal(canChooseTableColour(), true);
  assert.equal(tableColourAxis(), "kind");
});

test("a page with data kinds and modules can colour tables by module", () => {
  useConfig();
  state.tableColour = "module";
  assert.equal(tableColourAxis(), "module");
});

test("a page with only one axis offers no choice and keeps today's colouring, whatever was saved", () => {
  state.tableColour = "module";
  useConfig(withoutModules);
  assert.equal(canChooseTableColour(), false);
  assert.equal(tableColourAxis(), "kind");
  useConfig(withoutKinds);
  assert.equal(canChooseTableColour(), false);
  assert.equal(tableColourAxis(), "kind", "no kinds: no colour class at all, as today");
});

test("legend keys for either axis: colour class and label in config order", () => {
  useConfig();
  const keys = axis => [...legendKeysHtml(axis).matchAll(/<span class="lkey ([km]-\d+)">([^<]*)<\/span>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(keys("kind"), Object.values(read("config.json").dataKinds).map((spec, i) => ["k-" + i, spec.label]));
  assert.deepEqual(keys("module").map(k => k[1]), ["Catalog", "Accounts", "Stock", "Ordering", "Community"]);
});
