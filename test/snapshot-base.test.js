import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeModel } from "../src/model/normalize.js";
import { emptyLayout } from "../src/model/page-data.js";
import { STATE_FORMAT, parseSnapshot } from "../src/viewer/model.js";
import { decideSavedState, fingerprintModel } from "../src/viewer/snapshot-base.js";

const field = (name, extra = {}) => ({ name, type: "String", ...extra });
const builtInV1 = normalizeModel({
  version: 1,
  entities: [{ name: "Book", fields: [field("id", { pk: true }), field("title")] }],
  relations: [],
});
const builtInV2 = normalizeModel({
  version: 1,
  entities: [
    { name: "Book", fields: [field("id", { pk: true }), field("title")] },
    { name: "Author", fields: [field("id", { pk: true }), field("name")] },
  ],
  relations: [],
});
const editedV1 = normalizeModel({
  version: 1,
  entities: [{ name: "Book", fields: [field("id", { pk: true }), field("title"), field("isbn")] }],
  relations: [],
});
const layout = emptyLayout();
const snapshotOf = (target, base) => ({ format: STATE_FORMAT, target, layout, savedAt: "2026-01-01T12:00:00.000Z", ...(base === undefined ? {} : { base }) });

test("the fingerprint is deterministic and ignores key order", () => {
  const reordered = JSON.parse(JSON.stringify(builtInV1), (key, value) =>
    value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value);
  assert.equal(fingerprintModel(builtInV1), fingerprintModel(structuredClone(builtInV1)));
  assert.equal(fingerprintModel(builtInV1), fingerprintModel(reordered));
  assert.match(fingerprintModel(builtInV1), /^[0-9a-z]+$/);
});

test("different models get different fingerprints; a page without a target has none", () => {
  assert.notEqual(fingerprintModel(builtInV1), fingerprintModel(builtInV2));
  assert.notEqual(fingerprintModel(builtInV1), fingerprintModel(editedV1));
  assert.equal(fingerprintModel(null), null);
});

test("no saved snapshot: nothing to decide", () => {
  assert.equal(decideSavedState(fingerprintModel(builtInV2), null), "none");
});

test("a snapshot based on the current built-in target is applied", () => {
  const base = fingerprintModel(builtInV2);
  assert.equal(decideSavedState(base, snapshotOf(editedV1, base)), "apply");
});

test("a snapshot based on an older built-in target asks instead of replacing the newer one", () => {
  const snapshot = snapshotOf(editedV1, fingerprintModel(builtInV1));
  assert.equal(decideSavedState(fingerprintModel(builtInV2), snapshot), "ask");
});

test("a snapshot without base counts as based on an unknown older version", () => {
  assert.equal(decideSavedState(fingerprintModel(builtInV2), snapshotOf(editedV1, null)), "ask");
});

test("a snapshot whose target equals the built-in target is applied whatever its base (nothing can be lost)", () => {
  const builtIn = fingerprintModel(builtInV2);
  assert.equal(decideSavedState(builtIn, snapshotOf(builtInV2, null)), "apply");
  assert.equal(decideSavedState(builtIn, snapshotOf(builtInV2, fingerprintModel(builtInV1))), "apply");
});

test("a page without a built-in target applies saved layouts as before", () => {
  assert.equal(decideSavedState(null, snapshotOf(null, null)), "apply");
});

test("parseSnapshot keeps the base and treats a missing one as null", () => {
  assert.equal(parseSnapshot(snapshotOf(builtInV1, "abc"), true).base, "abc");
  assert.equal(parseSnapshot(snapshotOf(builtInV1), true).base, null);
  assert.equal(parseSnapshot(snapshotOf(builtInV1, null), true).base, null);
});

test("parseSnapshot rejects a base that is not a string", () => {
  assert.throws(() => parseSnapshot(snapshotOf(builtInV1, 42), true), /base/);
});
