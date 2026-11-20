import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentsCross } from "../src/viewer/geometry.js";

test("segmentsCross: only a proper crossing counts, touching or parallel segments do not", () => {
  assert.equal(segmentsCross([0, 0], [2, 2], [0, 2], [2, 0]), true, "an X");
  assert.equal(segmentsCross([0, 0], [1, 1], [0, 2], [2, 0]), false, "ends on the other segment");
  assert.equal(segmentsCross([0, 0], [2, 0], [0, 1], [2, 1]), false, "parallel");
  assert.equal(segmentsCross([0, 0], [1, 0], [2, 0], [3, 0]), false, "collinear apart");
  assert.equal(segmentsCross([0, 0], [1, 1], [2, 0], [3, 1]), false, "apart");
});
