// Keeps schema/model.schema.json (for editors) and the runtime validator (src/model/normalize.js) in agreement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { ModelError, normalizeModel, toDocument } from "../src/model/normalize.js";

const read = async path => JSON.parse(await readFile(new URL("../" + path, import.meta.url), "utf8"));
const validateWithSchema = new Ajv2020({ allErrors: true }).compile(await read("schema/model.schema.json"));

const VALID = ["test/fixtures/library.expected.json", "test/fixtures/shop.expected.json", "examples/bookshop/current.model.json", "examples/bookshop/target.model.json"];

for (const path of VALID) {
  test("valid for schema and runtime validator: " + path, async () => {
    const doc = await read(path);
    assert.ok(validateWithSchema(doc), JSON.stringify(validateWithSchema.errors));
    const model = normalizeModel(doc, path);
    assert.ok(validateWithSchema(toDocument(model)), "toDocument output must stay schema-valid");
  });
}

const base = { version: 1, entities: [{ name: "A", fields: [{ name: "id", type: "Int" }] }] };
const INVALID = {
  "wrong version": { ...base, version: 2 },
  "field without type": { version: 1, entities: [{ name: "A", fields: [{ name: "id" }] }] },
  "bad cardinality": { ...base, relations: [{ from: "A", to: "A", cardinality: { from: "many" } }] },
  "index without fields": { ...base, indexes: [{ entity: "A", fields: [] }] },
  "origin not a list": { version: 1, entities: [{ name: "A", origin: "B", fields: [] }] },
};

for (const [name, doc] of Object.entries(INVALID)) {
  test("rejected by schema and runtime validator: " + name, () => {
    assert.equal(validateWithSchema(doc), false);
    assert.throws(() => normalizeModel(doc), ModelError);
  });
}

test("the runtime validator also checks references the JSON schema cannot express", () => {
  const dangling = { ...base, relations: [{ from: "A", to: "Missing", fromFields: ["nope"] }] };
  assert.equal(validateWithSchema(dangling), true);
  assert.throws(() => normalizeModel(dangling), /Missing.*is not an entity id/s);
});

test("review marker, change flag, index note and index expressions are kept", () => {
  const doc = {
    version: 1,
    entities: [{ name: "A", reviewed: true, fields: [{ name: "id", type: "Int", pk: true }, { name: "email", type: "String", changed: true }] }],
    indexes: [{ entity: "A", fields: ["lower(email)", "id"], unique: true, note: "case-insensitive login" }],
  };
  assert.ok(validateWithSchema(doc), JSON.stringify(validateWithSchema.errors));
  const model = normalizeModel(doc);
  assert.equal(model.entities[0].reviewed, true);
  assert.equal(model.entities[0].fields[1].changed, true);
  assert.equal(model.entities[0].fields[0].changed, undefined);
  assert.deepEqual(model.indexes[0], { entity: "A", fields: ["lower(email)", "id"], unique: true, note: "case-insensitive login" });
  assert.ok(validateWithSchema(toDocument(model)));
  assert.throws(() => normalizeModel({ ...doc, indexes: [{ entity: "A", fields: ["missing"] }] }), /"missing" is not a field of A/);
  assert.throws(() => normalizeModel({ ...doc, entities: [{ ...doc.entities[0], reviewed: "yes" }] }), /reviewed must be a boolean/);
});

test("entity module is kept, checked and written back (round trip)", () => {
  const doc = { version: 1, entities: [{ name: "Book", kind: "catalog", module: "catalog", fields: [{ name: "id", type: "Int", pk: true }] }] };
  assert.ok(validateWithSchema(doc), JSON.stringify(validateWithSchema.errors));
  const model = normalizeModel(doc);
  assert.equal(model.entities[0].module, "catalog");
  assert.equal(toDocument(model).entities[0].module, "catalog");
  assert.deepEqual(normalizeModel(toDocument(model)), model);
  assert.equal(normalizeModel({ ...doc, entities: [{ ...doc.entities[0], module: "" }] }).entities[0].module, undefined);
  const bad = { ...doc, entities: [{ ...doc.entities[0], module: 3 }] };
  assert.equal(validateWithSchema(bad), false);
  assert.throws(() => normalizeModel(bad), /entities\[0\]\.module must be a string/);
});
