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
