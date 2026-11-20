import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeForces, createForceSimulation, forceTick, framePositions, settledPositions } from "../src/viewer/layout-force.js";
import { arrangeRadial } from "../src/viewer/layout-radial.js";
import { scoreArrangement } from "../src/viewer/layout.js";
import { largeModel } from "./large-model.js";

// The fixture as the viewer passes it: relations to the hub (tile) tables are not lines and do not pull.
function fixture() {
  const model = largeModel();
  const hubs = new Set(model.hubTables);
  return { ...model, relations: model.relations.filter(r => !hubs.has(r.from) && !hubs.has(r.to)) };
}
const centres = (boxes, pos) => new Map(boxes.map(b => [b.id, [pos[b.id][0] + b.w / 2, pos[b.id][1] + b.h / 2]]));
const mean = points => [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
// Pairs closer than gap px on both axes (the layout keeps a 50 px gap; 1 px slack for rounding).
function overlappingPairs(boxes, pos, gap = 49) {
  const found = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j], a = pos[A.id], b = pos[B.id];
    if (a[0] < b[0] + B.w + gap && b[0] < a[0] + A.w + gap && a[1] < b[1] + B.h + gap && b[1] < a[1] + A.h + gap) found.push([A.id, B.id]);
  }
  return found;
}

test("arrangeForces: same input twice -> same output, every table placed, a 50 px gap between tables", () => {
  const { boxes, relations, moduleOf } = fixture();
  const first = arrangeForces(boxes, relations, { moduleOf });
  assert.deepEqual(arrangeForces(boxes, relations, { moduleOf }), first);
  assert.equal(Object.keys(first.pos).length, boxes.length);
  assert.deepEqual(overlappingPairs(boxes, first.pos), []);
  assert.equal(Math.min(...Object.values(first.pos).map(p => p[0])), 60, "the drawing starts at the shared origin");
});

test("forceTick step by step (the animation) ends in exactly the static result", () => {
  const { boxes, relations, moduleOf } = fixture();
  const expected = arrangeForces(boxes, relations, { moduleOf });
  const simulation = createForceSimulation(boxes, relations, { moduleOf });
  let steps = 0, last = null;
  while (forceTick(simulation)) { steps += 1; last = framePositions(simulation, expected.shift); }
  assert.ok(steps > 100, "the simulation runs many steps (got " + steps + ")");
  assert.deepEqual(settledPositions(simulation), expected);
  assert.equal(forceTick(simulation), false, "a cooled-down simulation stays put");
  // The last frame is drawn in the frame of the final layout: the closing overlap removal moves little.
  const moved = boxes.map(b => distance(last[b.id], expected.pos[b.id])).sort((a, b) => a - b);
  assert.ok(moved[Math.floor(moved.length / 2)] < 20, "median jump from the last frame to the result: " + moved[Math.floor(moved.length / 2)]);
});

test("tables without relation and module end inside the drawing, not at its rim", () => {
  const { boxes, relations, moduleOf } = fixture();
  const { pos } = arrangeForces(boxes, relations, { moduleOf });
  const related = new Set(relations.flatMap(r => [r.from, r.to]));
  const at = centres(boxes, pos), middle = mean([...at.values()]);
  const loose = boxes.filter(b => !related.has(b.id) && moduleOf(b.id) == null);
  assert.ok(loose.length >= 2, "the fixture has loose tables");
  const reach = Math.max(...boxes.filter(b => related.has(b.id)).map(b => distance(at.get(b.id), middle)));
  for (const b of loose) assert.ok(distance(at.get(b.id), middle) < 0.8 * reach, b.id + " lies near the middle");
});

test("tables of one module form an island: modules lie apart, their tables close to their own module", () => {
  const { boxes, relations, moduleOf } = fixture();
  const spread = layoutModuleOf => {
    const at = centres(boxes, arrangeForces(boxes, relations, { moduleOf: layoutModuleOf }).pos);
    const members = new Map();
    for (const b of boxes) { const key = moduleOf(b.id); if (key != null) members.set(key, [...(members.get(key) || []), at.get(b.id)]); }
    const centroids = new Map([...members].map(([key, points]) => [key, mean(points)]));
    let ownNearest = 0, count = 0;
    for (const [key, points] of members) for (const p of points) {
      count += 1;
      const nearest = [...centroids].reduce((best, [k, c]) => (distance(p, c) < best[1] ? [k, distance(p, c)] : best), [null, Infinity])[0];
      if (nearest === key) ownNearest += 1;
    }
    return ownNearest / count;
  };
  const withModules = spread(moduleOf), without = spread(() => null);
  assert.ok(withModules >= 0.6, "share of tables nearest to their own module's centre: " + withModules);
  assert.ok(withModules > without + 0.15, "the cluster force makes the islands (" + without + " -> " + withModules + ")");
});

test("an opaque reference pulls weaker than a foreign key; extra pairs pull like relations", () => {
  const boxes = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, x: (i % 3) * 600, y: Math.floor(i / 3) * 600, w: 236, h: 150 }));
  const gap = (pos, p, q) => distance(pos[p], pos[q]);
  const { pos } = arrangeForces(boxes, [{ from: "a", to: "b" }, { from: "c", to: "d", opaque: true }]);
  assert.ok(gap(pos, "a", "b") < gap(pos, "c", "d"), "foreign key closer than opaque reference");
  const chain = [{ from: "a", to: "e" }, { from: "a", to: "b" }, { from: "b", to: "f" }];
  const free = arrangeForces(boxes, chain).pos, pulled = arrangeForces(boxes, chain, { extra: [["e", "f", 1]] }).pos;
  assert.ok(gap(pulled, "e", "f") < gap(free, "e", "f") / 2, "an extra pair (a group) pulls its tables together");
});

test("tables starting on the same spot are spread (seeded) and end overlap-free; empty input is fine", () => {
  const boxes = Array.from({ length: 12 }, (_, i) => ({ id: "t" + i, x: 0, y: 0, w: 236, h: 160 }));
  const relations = boxes.slice(1).map((b, i) => ({ from: boxes[i].id, to: b.id }));
  const starts = createForceSimulation(boxes, relations).nodes.map(n => n.x + "," + n.y);
  assert.equal(new Set(starts).size, boxes.length, "every table gets its own start point");
  const first = arrangeForces(boxes, relations);
  assert.deepEqual(arrangeForces(boxes, relations), first);
  assert.ok(Object.values(first.pos).flat().every(Number.isFinite));
  assert.deepEqual(overlappingPairs(boxes, first.pos), []);
  const ys = Object.values(first.pos).map(p => p[1]);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 160, "spread in two dimensions, not lined up on the start row");
  assert.deepEqual(arrangeForces([], []), { pos: {}, shift: [0, 0] });
});

test("on the 130-table fixture Forces has fewer crossings and far shorter lines than Star", () => {
  const { boxes, relations, moduleOf } = fixture();
  const forces = scoreArrangement(boxes, arrangeForces(boxes, relations, { moduleOf }).pos, relations);
  const star = scoreArrangement(boxes, arrangeRadial(boxes, relations).pos, relations);
  // Measured when tuned: Forces 171 crossings + 183 lines under tables, Star 412 + 76; total line length 1 : 4.4.
  assert.ok(forces.crossings + forces.under < star.crossings + star.under, JSON.stringify({ forces, star }));
  assert.ok(forces.length * 3 < star.length, JSON.stringify({ forces, star }));
});
