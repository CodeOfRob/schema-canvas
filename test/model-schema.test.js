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
