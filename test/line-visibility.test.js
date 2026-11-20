import { test } from "node:test";
import assert from "node:assert/strict";
import { LINE_TYPES, hiddenLineTypesFrom, isRelationHidden } from "../src/viewer/line-visibility.js";

test("a relation is hidden by its diff status or, as an opaque reference, by the opaque type", () => {
  const fk = { id: "r1" }, opaque = { id: "r2", opaque: true };
  const hidden = new Set(["added", "opaque"]);
  assert.equal(isRelationHidden(fk, "added", hidden, true), true);
  assert.equal(isRelationHidden(fk, "same", hidden, true), false);
  assert.equal(isRelationHidden(opaque, "same", hidden, true), true, "opaque hides whatever the status");
  assert.equal(isRelationHidden(opaque, "changed", new Set(["changed"]), true), true, "the status hides an opaque one too");
  assert.equal(isRelationHidden(opaque, "changed", new Set(), true), false);
});

test("without a diff the status types do not apply (no legend entry to switch them back on)", () => {
  assert.equal(isRelationHidden({ id: "r" }, "same", new Set(["same"]), false), false);
  assert.equal(isRelationHidden({ id: "r", opaque: true }, "same", new Set(["opaque"]), false), true);
});

test("hiddenLineTypesFrom reads the stored list, drops unknown entries and migrates the old opaque switch", () => {
  assert.deepEqual([...hiddenLineTypesFrom(["same", "nope", 3, "opaque"], false)], ["same", "opaque"]);
  assert.deepEqual([...hiddenLineTypesFrom(null, true)], ["opaque"], "hide-opaque from an earlier version stays hidden");
  assert.deepEqual([...hiddenLineTypesFrom(null, false)], []);
  assert.deepEqual([...hiddenLineTypesFrom([], true)], [], "a stored list wins over the old switch");
  assert.deepEqual([...hiddenLineTypesFrom({ opaque: true }, false)], [], "unreadable -> nothing hidden");
  assert.deepEqual(LINE_TYPES, ["added", "changed", "removed", "same", "opaque"]);
});
