import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/model/page-data.js";

const full = {
  title: "Shop", description: "**Target** after the rework", language: "de-CH", storageKey: "shop",
  dataKinds: { catalog: { label: "Catalog", color: "#0060a3", description: "long-lived" } },
  entityKinds: { Book: "catalog" },
  sections: [{ title: "Open", markdown: "- one" }],
  strings: { addTable: "+ Tisch" },
};

test("a normalized config validates again (the page re-checks what the CLI wrote)", () => {
  const once = normalizeConfig(full);
  assert.deepEqual(normalizeConfig(once), once);
  assert.deepEqual(normalizeConfig(normalizeConfig({})), normalizeConfig({}));
  assert.equal(once.dataKinds.catalog.description, "long-lived");
  assert.deepEqual(once.sections, [{ title: "Open", markdown: "- one" }]);
});

test("bad sections, language tags, strings and unknown keys are rejected", () => {
  assert.throws(() => normalizeConfig({ sections: [{ title: "x" }] }), /sections must be/);
  assert.throws(() => normalizeConfig({ sections: [{ title: "x", markdown: "y", html: "<b>" }] }), /sections must be/);
  assert.throws(() => normalizeConfig({ language: "not a tag" }), /language must be/);
  assert.throws(() => normalizeConfig({ strings: { addTable: 1 } }), /strings must map names to strings/);
  assert.throws(() => normalizeConfig({ dataKinds: { a: { label: "A", description: 3 } } }), /dataKinds.a must be/);
  assert.throws(() => normalizeConfig({ sectionz: [] }), /unknown key "sectionz"/);
});

test("tileTables: a name means the tile display, an object chooses tile or badge; normalized form re-validates", () => {
  const config = normalizeConfig({ tileTables: ["Edition", { name: "Account", display: "badge" }, { name: "Shelf" }] });
  assert.deepEqual(config.tileTables, [{ name: "Edition", display: "tile" }, { name: "Account", display: "badge" }, { name: "Shelf", display: "tile" }]);
  assert.deepEqual(normalizeConfig(config).tileTables, config.tileTables);
  assert.deepEqual(normalizeConfig({}).tileTables, []);
});

test("tileTables: bad entries, unknown display modes and duplicates are rejected", () => {
  assert.throws(() => normalizeConfig({ tileTables: "Edition" }), /tileTables must be an array/);
  assert.throws(() => normalizeConfig({ tileTables: [3] }), /tileTables\[0\] must be a table name or/);
  assert.throws(() => normalizeConfig({ tileTables: [{ name: "A", display: "line" }] }), /tileTables\[0\] must be a table name or/);
  assert.throws(() => normalizeConfig({ tileTables: [{ name: "A", colour: "red" }] }), /tileTables\[0\] must be a table name or/);
  assert.throws(() => normalizeConfig({ tileTables: ["A", { name: "A", display: "badge" }] }), /tileTables: "A" is listed twice/);
});

const modules = {
  catalog: { label: "Catalog", color: "#0060a3", description: "what the shop sells" },
  ordering: { label: "Ordering", dependsOn: ["catalog"] },
  billing: { label: "Billing", dependsOn: ["ordering"] },
};

test("modules and entityModules are normalized; dependsOn is kept only where declared", () => {
  const config = normalizeConfig({ modules, entityModules: { Book: "catalog", Order: "ordering", Note: "none" } });
  assert.deepEqual(config.modules, modules);
  assert.equal("dependsOn" in config.modules.catalog, false);
  assert.deepEqual(config.entityModules, { Book: "catalog", Order: "ordering", Note: "none" });
  assert.deepEqual(normalizeConfig(config), config);
  assert.deepEqual(normalizeConfig({}).modules, {});
  assert.deepEqual(normalizeConfig({}).entityModules, {});
  assert.deepEqual(normalizeConfig({ modules: { a: { label: "A", dependsOn: [] } } }).modules.a.dependsOn, []);
});

test("modules: reserved key, bad specs, unknown or self dependencies and dependency cycles are rejected", () => {
  assert.throws(() => normalizeConfig({ modules: { none: { label: "None" } } }), /modules: "none" is reserved/);
  assert.throws(() => normalizeConfig({ modules: { a: { title: "A" } } }), /modules\.a must be/);
  assert.throws(() => normalizeConfig({ modules: { a: { label: "A", color: "url(x)" } } }), /modules\.a must be/);
  assert.throws(() => normalizeConfig({ modules: { a: { label: "A", dependsOn: "b" } } }), /modules\.a must be/);
  assert.throws(() => normalizeConfig({ modules: { a: { label: "A", dependsOn: ["b"] } } }), /modules\.a\.dependsOn: unknown module "b"/);
  assert.throws(() => normalizeConfig({ modules: { a: { label: "A", dependsOn: ["a"] } } }), /modules\.a\.dependsOn: a module cannot depend on itself/);
  assert.throws(() => normalizeConfig({ modules: { a: { label: "A", dependsOn: ["b"] }, b: { label: "B", dependsOn: ["c"] }, c: { label: "C", dependsOn: ["a"] } } }), /modules: dependsOn forms a cycle: a -> b -> c -> a/);
  assert.throws(() => normalizeConfig({ modules, entityModules: { Book: "shipping" } }), /entityModules\.Book: unknown module "shipping"/);
  assert.throws(() => normalizeConfig({ entityModules: { Book: 1 } }), /entityModules must map names to strings/);
});

test("data kinds reject unknown keys in their spec (typos must not vanish silently)", () => {
  assert.throws(() => normalizeConfig({ dataKinds: { a: { label: "A", colour: "#fff" } } }), /dataKinds\.a must be/);
  assert.throws(() => normalizeConfig({ dataKinds: { a: { label: "A", dependsOn: [] } } }), /dataKinds\.a must be/);
});

// ---------- layout.modules ----------
import { normalizeLayout, emptyLayout } from "../src/model/page-data.js";

test("normalizeLayout carries layout.modules and accepts old layouts without it", () => {
  const withModules = normalizeLayout({ version: 1, current: {}, target: {}, groups: [], modules: { sales: [10, 20], none: [0, 5] } });
  assert.deepEqual(withModules.modules, { sales: [10, 20], none: [0, 5] });
  assert.deepEqual(normalizeLayout(withModules), withModules);
  assert.deepEqual(normalizeLayout({ version: 1, current: {}, target: {}, groups: [] }).modules, {});
  assert.deepEqual(emptyLayout().modules, {});
});

test("normalizeLayout rejects a bad layout.modules shape", () => {
  const base = { version: 1, current: {}, target: {}, groups: [] };
  for (const bad of [[], "x", { sales: [1] }, { sales: ["a", 2] }, { sales: [1, NaN] }, { sales: { x: 1, y: 2 } }]) {
    assert.throws(() => normalizeLayout({ ...base, modules: bad }), /modules must map module keys to \[x, y\]/, JSON.stringify(bad));
  }
});

test("modules.transitive: only a boolean next to dependsOn; kept only where declared", () => {
  const config = normalizeConfig({ modules: { a: { label: "A", dependsOn: [] }, b: { label: "B", dependsOn: ["a"], transitive: false }, c: { label: "C", dependsOn: ["b"], transitive: true } } });
  assert.equal(config.modules.b.transitive, false);
  assert.equal(config.modules.c.transitive, true);
  assert.equal("transitive" in config.modules.a, false);
  assert.deepEqual(normalizeConfig(config), config);
  assert.throws(() => normalizeConfig({ modules: { a: { label: "A", dependsOn: [], transitive: "no" } } }), /modules\.a must be/);
  assert.throws(() => normalizeConfig({ modules: { a: { label: "A", transitive: false } } }), /modules\.a\.transitive: needs dependsOn/);
});
