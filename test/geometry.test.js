import { test } from "node:test";
import assert from "node:assert/strict";
import { boxGap, centredNodes, islandsWithin, positionsAtOrigin, segmentsCross } from "../src/viewer/geometry.js";

test("segmentsCross: only a proper crossing counts, touching or parallel segments do not", () => {
  assert.equal(segmentsCross([0, 0], [2, 2], [0, 2], [2, 0]), true, "an X");
  assert.equal(segmentsCross([0, 0], [1, 1], [0, 2], [2, 0]), false, "ends on the other segment");
  assert.equal(segmentsCross([0, 0], [2, 0], [0, 1], [2, 1]), false, "parallel");
  assert.equal(segmentsCross([0, 0], [1, 0], [2, 0], [3, 0]), false, "collinear apart");
  assert.equal(segmentsCross([0, 0], [1, 1], [2, 0], [3, 1]), false, "apart");
});

test("centredNodes and positionsAtOrigin round-trip, moving the drawing's top-left corner to the origin", () => {
  const boxes = [{ id: "a", x: -40.4, y: 10, w: 236, h: 100 }, { id: "b", x: 300, y: -20.6, w: 120, h: 50 }];
  const nodes = centredNodes(boxes);
  assert.deepEqual(nodes[0], { id: "a", x: 77.6, y: 60, w: 236, h: 100 });
  const { pos, shift } = positionsAtOrigin(nodes, [60, 80]);
  assert.deepEqual(pos, { a: [60, 111], b: [400, 80] });
  assert.deepEqual(shift, [100.4, 100.6]);
  assert.deepEqual(positionsAtOrigin(nodes).pos, { a: [0, 31], b: [340, 0] }, "origin defaults to (0, 0)");
});

test("boxGap is the edge-to-edge distance of two boxes (0 when they touch or overlap)", () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  assert.equal(boxGap(a, { x: 130, y: 10, w: 10, h: 10 }), 30, "side by side");
  assert.equal(boxGap(a, { x: 130, y: 90, w: 10, h: 10 }), 50, "diagonal: 30 across, 40 down");
  assert.equal(boxGap(a, { x: 50, y: 20, w: 100, h: 100 }), 0, "overlapping");
});

test("islandsWithin: boxes closer than the gap (also through a chain) form one island, in input order", () => {
  const box = x => ({ x, y: 0, w: 100, h: 50 });
  const boxes = [box(0), box(500), box(150), box(260)];
  assert.deepEqual(islandsWithin(boxes, 60), [[boxes[0], boxes[2], boxes[3]], [boxes[1]]], "0-150-260 chain, 500 apart");
  assert.deepEqual(islandsWithin(boxes, 140), [boxes], "140 joins the last gap too");
  assert.deepEqual(islandsWithin([], 60), []);
});
