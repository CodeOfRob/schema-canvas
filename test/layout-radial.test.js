import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeRadial, centreCandidateCount, hubCandidates } from "../src/viewer/layout-radial.js";
import { weightedArrangementScore } from "../src/viewer/layout.js";
import { largeModel } from "./large-model.js";

function fixture() {
  const model = largeModel();
  const hubs = new Set(model.hubTables);
  return { boxes: model.boxes, relations: model.relations.filter(r => !hubs.has(r.from) && !hubs.has(r.to)) };
}

/** Degree (distinct neighbours) of every table, from the drawn relations. */
function degrees(relations) {
  const neighbours = new Map();
  for (const r of relations) for (const [a, b] of [[r.from, r.to], [r.to, r.from]]) { if (!neighbours.has(a)) neighbours.set(a, new Set()); if (a !== b) neighbours.get(a).add(b); }
  return new Map([...neighbours].map(([id, set]) => [id, set.size]));
}

test("the centre is a hub: the best-scoring of the top 10 % by degree; same input -> same output", () => {
  const { boxes, relations } = fixture();
  const best = arrangeRadial(boxes, relations);
  assert.deepEqual(arrangeRadial(boxes, relations), best);
  const degree = degrees(relations);
  // The biggest group of the fixture (the tables connected to the chosen centre).
  const main = new Set([best.centre]);
  for (let grown = true; grown;) { grown = false; for (const r of relations) if (main.has(r.from) !== main.has(r.to)) { main.add(r.from); main.add(r.to); grown = true; } }
  const sorted = [...main].map(id => degree.get(id)).sort((a, b) => b - a);
  const minHubDegree = sorted[Math.ceil(main.size * 0.1) - 1];
  assert.ok(degree.get(best.centre) >= minHubDegree, "centre degree " + degree.get(best.centre) + ", hubs from " + minHubDegree);
  // Never worse than any other hub as the centre.
  const score = pos => weightedArrangementScore(boxes, pos, relations).total;
  for (const id of main) {
    if (degree.get(id) < minHubDegree) continue;
    assert.ok(score(best.pos) <= score(arrangeRadial(boxes, relations, { centre: id }).pos), id + " would score better than " + best.centre);
  }
});

test("hub candidates: the top 10 % by degree, at least three, ties at the cut included, ordered by degree then id", () => {
  const degreeOf = new Map([["e", 9], ["b", 7], ["a", 7], ["c", 5], ["d", 5], ["f", 2]]);
  const many = [...degreeOf.keys(), ...Array.from({ length: 24 }, (_, i) => "z" + i)];
  for (const id of many) if (!degreeOf.has(id)) degreeOf.set(id, 1);
  // 30 tables: 10 % = 3 -> the cut is the third-highest degree (7); "a" and "b" tie at it.
  assert.deepEqual(hubCandidates(many, id => degreeOf.get(id)), ["e", "a", "b"]);
  // 6 tables: 10 % rounds up to 1, the minimum makes it 3 -> the cut is again the third-highest degree.
  assert.deepEqual(hubCandidates(["f", "e", "d", "c", "b", "a"], id => degreeOf.get(id)), ["e", "a", "b"]);
  assert.deepEqual(hubCandidates(["x", "y"], () => 1), ["x", "y"], "fewer tables than the minimum: all of them");
});

test("on the fixture the best centre beats the old heuristic centre clearly", () => {
  const { boxes, relations } = fixture();
  const best = weightedArrangementScore(boxes, arrangeRadial(boxes, relations).pos, relations);
  // table126 is what the old heuristic (smallest mean relation distance) chose on this fixture.
  const old = weightedArrangementScore(boxes, arrangeRadial(boxes, relations, { centre: "table126" }).pos, relations);
  assert.ok(best.crossings + best.under < 0.6 * (old.crossings + old.under), JSON.stringify({ best, old }));
});

test("a fixed centre (for comparisons) stays the centre; small groups never take it", () => {
  const { boxes, relations } = fixture();
  const fixed = arrangeRadial(boxes, relations, { centre: "table045" });
  assert.equal(fixed.centre, "table045");
  assert.notEqual(arrangeRadial(boxes, relations).centre, "table045", "the search would have picked another one");
  // A table outside the biggest group (here: one of a separate pair) is ignored: the search runs as without it, and
  // the pair keeps its own deterministic centre.
  const searched = arrangeRadial(boxes, relations);
  const inMain = new Set([searched.centre]);
  for (let grown = true; grown;) {
    grown = false;
    for (const r of relations) if (inMain.has(r.from) !== inMain.has(r.to)) { inMain.add(r.from); inMain.add(r.to); grown = true; }
  }
  const pairMember = relations.find(r => !inMain.has(r.from)).from;
  assert.deepEqual(arrangeRadial(boxes, relations, { centre: pairMember }), searched);
});

test("equal scores: the centre with the smallest id wins, whatever the order of the tables", () => {
  // A ring of four equal tables: every centre gives the same score.
  const boxes = ["d", "b", "a", "c"].map(id => ({ id, x: 0, y: 0, w: 200, h: 120 }));
  const relations = [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "a" }];
  assert.equal(arrangeRadial(boxes, relations).centre, "a");
  assert.equal(arrangeRadial([...boxes].reverse(), relations).centre, "a");
});

test("the centre search is bounded by size, not by the clock: all candidates up to the fixture size, few on a huge model", () => {
  // The 130-table fixture (197 lines) and a real model of that size can try far more than their 12-13 hubs.
  assert.ok(centreCandidateCount(130, 197) >= 100);
  assert.ok(centreCandidateCount(138, 185) >= 100);
  // 500 tables: one candidate costs about 20x as much, so far fewer are tried; never fewer than a handful.
  const big = centreCandidateCount(500, 734);
  assert.ok(big >= 5 && big <= 10, "500 tables: " + big + " candidates");
  assert.equal(centreCandidateCount(5000, 9000), 5);
});

test("on a 500-table model the bounded search stays deterministic", () => {
  const model = largeModel(20261120, { tables: 500, modules: 60, relations: 1420 });
  const hubs = new Set(model.hubTables);
  const relations = model.relations.filter(r => !hubs.has(r.from) && !hubs.has(r.to));
  assert.deepEqual(arrangeRadial(model.boxes, relations), arrangeRadial(model.boxes, relations));
});

test("compact rings: every ring is one circle, and only as big as its tables need", () => {
  const { boxes, relations } = fixture();
  const { pos, centre } = arrangeRadial(boxes, relations);
  const box = new Map(boxes.map(b => [b.id, b]));
  const at = id => [pos[id][0] + box.get(id).w / 2, pos[id][1] + box.get(id).h / 2];
  const neighbours = new Map(boxes.map(b => [b.id, new Set()]));
  for (const r of relations) { neighbours.get(r.from).add(r.to); neighbours.get(r.to).add(r.from); }
  const depth = new Map([[centre, 0]]), queue = [centre];
  while (queue.length) { const x = queue.shift(); for (const y of neighbours.get(x)) if (!depth.has(y)) { depth.set(y, depth.get(x) + 1); queue.push(y); } }
  const radius = id => Math.hypot(at(id)[0] - at(centre)[0], at(id)[1] - at(centre)[1]);
  const rings = Math.max(...depth.values());
  for (let d = 1; d <= rings; d++) {
    const radii = [...depth].filter(([, v]) => v === d).map(([id]) => radius(id));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    assert.ok((Math.max(...radii) - Math.min(...radii)) / mean < 0.03, "ring " + d + " spreads " + Math.round(Math.min(...radii)) + "-" + Math.round(Math.max(...radii)));
  }
  // Sized by the narrowest slice instead, the first ring lay 3700 px out on this fixture.
  const first = [...depth].filter(([, v]) => v === 1).map(([id]) => radius(id));
  assert.ok(Math.max(...first) < 1200, "first ring at " + Math.round(Math.max(...first)) + " px");
});
