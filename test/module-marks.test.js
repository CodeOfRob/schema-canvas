import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeModel } from "../src/model/normalize.js";
import { normalizeConfig } from "../src/model/page-data.js";
import { legendKeysHtml, moduleTagHtml } from "../src/viewer/ui/module-marks.js";
import { state } from "../src/viewer/ui/state.js";

// The table view's module marks (tag in each table header, legend section) on the example page's config, and on the
// same config without modules: that page must render exactly as before (no tag, no legend entries).
const read = name => JSON.parse(readFileSync(new URL("../examples/bookshop/" + name, import.meta.url), "utf8"));
const model = normalizeModel(read("current.model.json"));
const table = name => model.entities.find(e => e.name === name);

function useConfig(raw) { state.page = { config: normalizeConfig(raw) }; }
function withoutModules() {
  const raw = read("config.json");
  delete raw.modules;
  delete raw.entityModules;
  return raw;
}

test("a table with a module gets a tag with the module's label, coloured by the module's class", () => {
  useConfig(read("config.json"));
  // Book is in "catalog", the first module: class m-0, the same class the module view and the filter use.
  assert.equal(moduleTagHtml(table("Book")), '<span class="mtag m-0" title="Module: Catalog">Catalog</span>');
  assert.equal(moduleTagHtml(table("Review")), '<span class="mtag m-4" title="Module: Community">Community</span>');
});

test("a table without a module gets no tag", () => {
  const raw = read("config.json");
  delete raw.entityModules.Book;
  useConfig(raw);
  assert.equal(moduleTagHtml(table("Book")), "");
});

test("a page without modules shows no tag and no legend entries", () => {
  useConfig(withoutModules());
  for (const entity of model.entities) assert.equal(moduleTagHtml(entity), "", entity.name);
  assert.equal(legendKeysHtml("module"), "");
});

test("the legend lists every module in config order, with its colour class and label", () => {
  useConfig(read("config.json"));
  const html = legendKeysHtml("module");
  const entries = [...html.matchAll(/<span class="lkey (m-\d+)">([^<]*)<\/span>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(entries, [["m-0", "Catalog"], ["m-1", "Accounts"], ["m-2", "Stock"], ["m-3", "Ordering"], ["m-4", "Community"]]);
});

test("labels are escaped in the tag and the legend", () => {
  const raw = read("config.json");
  raw.modules.catalog.label = "<b>Cat & Co</b>";
  useConfig(raw);
  assert.match(moduleTagHtml(table("Book")), />&lt;b&gt;Cat &amp; Co&lt;\/b&gt;</);
  assert.match(legendKeysHtml("module"), />&lt;b&gt;Cat &amp; Co&lt;\/b&gt;</);
});
