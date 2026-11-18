import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeByKind, arrangeByRelations, removeOverlaps, seededRandom } from "../src/viewer/layout.js";

const overlapping = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
function overlapCount(boxes, pos) {
  const placed = boxes.map(b => ({ ...b, x: pos[b.id][0], y: pos[b.id][1] }));
  let n = 0;
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (overlapping(placed[i], placed[j])) n++;
  return n;
}
function sampleBoxes(count, seed) {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({ id: "t" + i, x: Math.round(random() * 400), y: Math.round(random() * 400), w: 236, h: 80 + Math.round(random() * 300) }));
}
const chainRelations = boxes => boxes.slice(1).map((b, i) => ({ from: boxes[i].id, to: b.id }));

test("removeOverlaps separates heavily overlapping boxes", () => {
  const nodes = sampleBoxes(25, 3).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  assert.equal(removeOverlaps(nodes, 40, 40), true);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const A = nodes[i], B = nodes[j];
    const apart = Math.abs(A.x - B.x) >= (A.w + B.w) / 2 + 40 - 1e-6 || Math.abs(A.y - B.y) >= (A.h + B.h) / 2 + 40 - 1e-6;
    assert.ok(apart, "boxes " + i + " and " + j + " still overlap");
  }
});

test("arrangeByRelations is overlap-free and deterministic", () => {
  const boxes = sampleBoxes(14, 11);
  const relations = [...chainRelations(boxes), { from: "t0", to: "t5" }, { from: "t2", to: "t9" }];
  const first = arrangeByRelations(boxes, relations, { starts: 3 });
  const second = arrangeByRelations(boxes, relations, { starts: 3 });
  assert.deepEqual(first.pos, second.pos);
  assert.equal(overlapCount(boxes, first.pos), 0);
  assert.equal(Object.keys(first.pos).length, boxes.length);
});

test("arrangeByRelations puts related tables closer than unrelated ones", () => {
  const boxes = sampleBoxes(6, 5);
  const { pos } = arrangeByRelations(boxes, [{ from: "t0", to: "t1" }, { from: "t1", to: "t2" }, { from: "t3", to: "t4" }], { starts: 2 });
  const dist = (a, b) => Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]);
  assert.ok(dist("t0", "t1") < dist("t0", "t4"));
});

test("arrangeByKind gives every kind its own zone, in the configured order", () => {
  const boxes = sampleBoxes(9, 7);
  const kinds = { t0: "b", t1: "a", t2: "a", t3: "b", t4: null, t5: "a", t6: "b", t7: "a", t8: "zzz-unknown" };
  const pos = arrangeByKind(boxes, ["a", "b"], id => kinds[id]);
  assert.equal(overlapCount(boxes, pos), 0);
  const xs = kind => boxes.filter(b => (kind === null ? !["a", "b"].includes(kinds[b.id]) : kinds[b.id] === kind)).map(b => pos[b.id][0]);
  assert.ok(Math.max(...xs("a")) < Math.min(...xs("b")), "kind a left of kind b");
  assert.ok(Math.max(...xs("b")) < Math.min(...xs(null)), "unclassified last");
});

test("arrangeRadial: chosen centre in the middle, neighbours on the first ring, overlap-free, deterministic", async () => {
  const { arrangeRadial } = await import("../src/viewer/layout-radial.js");
  const boxes = sampleBoxes(16, 13);
  // hub t0 with a branch t1 -> t2 -> t3, a small separate group t10-t11-t12, and unrelated tables
  const relations = ["t1", "t4", "t5", "t6", "t7"].map(id => ({ from: id, to: "t0" })).concat(
    [{ from: "t2", to: "t1" }, { from: "t3", to: "t2" }, { from: "t11", to: "t10" }, { from: "t12", to: "t11" }]);
  const first = arrangeRadial(boxes, relations, { centre: "t0" });
  assert.deepEqual(arrangeRadial(boxes, relations, { centre: "t0" }).pos, first.pos);
  assert.equal(first.centre, "t0");
  assert.equal(Object.keys(first.pos).length, boxes.length);
  assert.equal(overlapCount(boxes, first.pos), 0);
  const centreOf = id => { const b = boxes.find(x => x.id === id); return [first.pos[id][0] + b.w / 2, first.pos[id][1] + b.h / 2]; };
  const dist = (a, b) => Math.hypot(centreOf(a)[0] - centreOf(b)[0], centreOf(a)[1] - centreOf(b)[1]);
  assert.ok(dist("t0", "t1") < dist("t0", "t3"), "deeper relation steps lie further out");
  assert.ok(centreOf("t10")[0] < Math.min(...["t0", "t1", "t4", "t5", "t6", "t7"].map(id => centreOf(id)[0])), "separate groups sit left of the star");
  assert.equal(arrangeRadial(boxes, relations).centre, "t0", "without a choice the most central table is the centre");
});
