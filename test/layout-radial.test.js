import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeRadial } from "../src/viewer/layout-radial.js";
import { weightedArrangementScore } from "../src/viewer/layout.js";
import { largeModel } from "./large-model.js";

function fixture() {
  const model = largeModel();
  const hubs = new Set(model.hubTables);
  return { boxes: model.boxes, relations: model.relations.filter(r => !hubs.has(r.from) && !hubs.has(r.to)) };
}

test("without a chosen centre the star takes the best-scoring centre; same input -> same output", () => {
  const { boxes, relations } = fixture();
  const best = arrangeRadial(boxes, relations);
  assert.deepEqual(arrangeRadial(boxes, relations), best);
  const score = pos => weightedArrangementScore(boxes, pos, relations).total;
  const related = new Set(relations.flatMap(r => [r.from, r.to]));
  // Never worse than any centre, so never worse than the old "most central table" either.
  for (const b of boxes) {
    if (!related.has(b.id)) continue;
    const run = arrangeRadial(boxes, relations, { centre: b.id });
    if (run.centre === b.id) assert.ok(score(best.pos) <= score(run.pos), b.id + " would score better than " + best.centre);
  }
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
