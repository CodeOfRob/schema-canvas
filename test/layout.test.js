import { test } from "node:test";
import assert from "node:assert/strict";
import { ARRANGEMENT_WEIGHTS, arrangeByKind, arrangeByRelations, removeOverlaps, scoreArrangement, seededRandom, weightedArrangementScore } from "../src/viewer/layout.js";

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

// Five small tables: lines a-b and c-d cross in an X; e sits on the line a-b.
const CROSSING_BOXES = ["a", "b", "c", "d", "e"].map(id => ({ id, w: 20, h: 20 }));
const CROSSING_POSITIONS = { a: [0, 0], b: [200, 200], c: [200, 0], d: [0, 200], e: [40, 40] };

test("scoreArrangement counts crossings and lines under tables of finished positions", () => {
  const score = scoreArrangement(CROSSING_BOXES, CROSSING_POSITIONS, [{ from: "a", to: "b" }, { from: "c", to: "d" }, { from: "b", to: "a" }]);
  assert.equal(score.crossings, 1);
  assert.equal(score.under, 1, "e is under a-b; the duplicate b-a counts once");
  assert.equal(Math.round(score.length), Math.round(2 * Math.hypot(200, 200)));
});

test("weightedArrangementScore adds crossings, lines under tables, mean line length and area with fixed weights", () => {
  const score = weightedArrangementScore(CROSSING_BOXES, CROSSING_POSITIONS, [{ from: "a", to: "b" }, { from: "c", to: "d" }]);
  assert.equal(score.crossings, 1);
  assert.equal(score.under, 1);
  assert.equal(Math.round(score.meanLine), Math.round(Math.hypot(200, 200)));
  assert.equal(score.area, 220 * 220 / 1e6, "drawing area in million px²");
  const w = ARRANGEMENT_WEIGHTS;
  assert.equal(score.total, w.crossing * 1 + w.under * 1 + w.meanLinePx * score.meanLine + w.areaMpx2 * score.area);
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
});

// ---------- module positions ----------
import { freezeModulePositions, placeModules } from "../src/viewer/layout.js";

const MODULE_BOX = { w: 220, h: 92 };
const moduleNodes = keys => keys.map(key => ({ key }));
const moduleEdges = (pairs, kind = "fk") => pairs.map(([from, to]) => ({ key: JSON.stringify([from, to, kind]), kind, from, to }));
const moduleBoxes = (keys, pos) => keys.map(key => ({ id: key, x: pos[key][0], y: pos[key][1], ...MODULE_BOX }));
// The module-graph.js shape placeModules reads: nodes, edges and whether any module declares dependsOn.
const moduleGraph = (nodes, edges = []) => ({ nodes: typeof nodes[0] === "string" ? moduleNodes(nodes) : nodes, edges, layered: nodes.some(n => n.dependsOn !== undefined) });

test("placeModules without saved positions equals the derived arrangement and is deterministic", () => {
  const keys = ["sales", "catalog", "billing", "none"], edges = moduleEdges([["sales", "catalog"], ["billing", "sales"]]);
  const a = placeModules(moduleGraph(keys, edges), {}, MODULE_BOX), b = placeModules(moduleGraph(keys, edges), {}, MODULE_BOX);
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), [...keys].sort());
  assert.equal(overlapCount(moduleBoxes(keys, a), a), 0);
});

test("placeModules: a saved position wins, unknown saved keys are ignored (and not part of the result)", () => {
  const keys = ["sales", "catalog"];
  const saved = { sales: [500, 700], catalog: [20, 30], gone: [1, 1] };
  const pos = placeModules(moduleGraph(keys, moduleEdges([["sales", "catalog"]])), saved, MODULE_BOX);
  assert.deepEqual(pos, { sales: [500, 700], catalog: [20, 30] });
  assert.deepEqual(saved.gone, [1, 1]);
});

test("placeModules: modules without saved position are placed free next to the saved ones", () => {
  const keys = ["sales", "catalog", "billing", "shipping", "none"];
  const saved = { sales: [100, 100], catalog: [150, 120] }; // saved boxes overlap each other on purpose: they stay as saved
  const pos = placeModules(moduleGraph(keys, moduleEdges([["billing", "sales"]])), saved, MODULE_BOX);
  assert.deepEqual(pos.sales, [100, 100]);
  assert.deepEqual(pos.catalog, [150, 120]);
  const fresh = ["billing", "shipping", "none"];
  const boxes = moduleBoxes(keys, pos);
  for (const id of fresh) for (const other of boxes) {
    const me = boxes.find(b => b.id === id);
    if (other.id !== id) assert.ok(!overlapping(me, other), id + " overlaps " + other.id);
  }
});

test("placeModules: the reserved key none is positioned like any other key", () => {
  const pos = placeModules(moduleGraph(["none", "sales"]), { none: [5, 6] }, MODULE_BOX);
  assert.deepEqual(pos.none, [5, 6]);
  assert.equal(pos.sales.length, 2);
});

test("placeModules does not mutate its inputs", () => {
  const saved = { sales: [1, 2] }, graph = moduleGraph([{ key: "sales", dependsOn: ["catalog"] }, { key: "catalog", dependsOn: [] }]);
  const before = JSON.stringify([saved, graph]);
  placeModules(graph, saved, MODULE_BOX);
  placeModules(graph, {}, MODULE_BOX);
  assert.equal(JSON.stringify([saved, graph]), before);
});

test("placeModules: once a module declares dependsOn the modules are layered, foundation at the bottom", () => {
  const nodes = [{ key: "ordering", dependsOn: ["catalog"] }, { key: "catalog", dependsOn: [] }, { key: "billing", dependsOn: ["ordering"] }, { key: "loose" }];
  const pos = placeModules(moduleGraph(nodes, moduleEdges([["loose", "billing"]])), {}, MODULE_BOX);
  assert.ok(pos.catalog[1] > pos.ordering[1] && pos.ordering[1] > pos.billing[1] && pos.billing[1] > pos.loose[1]);
  assert.equal(overlapCount(moduleBoxes(Object.keys(pos), pos), pos), 0);
  assert.equal(Math.min(...Object.values(pos).map(p => p[0])), 60, "same page origin as the other arrangements");
});

test("placeModules (layered): with every module declared, only the config decides; opaque edges never do", () => {
  const nodes = [{ key: "ordering", dependsOn: ["catalog"] }, { key: "catalog", dependsOn: [] }, { key: "billing", dependsOn: ["ordering", "catalog"] }];
  const currentModel = moduleGraph(nodes, moduleEdges([["ordering", "catalog"], ["billing", "ordering"]]));
  const targetModel = moduleGraph([...nodes, { key: "none", unassigned: true }], [...moduleEdges([["catalog", "billing"], ["none", "catalog"]]), ...moduleEdges([["catalog", "ordering"]], "opaque")]);
  const current = placeModules(currentModel, {}, MODULE_BOX), target = placeModules(targetModel, {}, MODULE_BOX);
  for (const key of ["ordering", "catalog", "billing"]) assert.deepEqual(target[key], current[key], key);
  const withoutOpaque = placeModules({ ...targetModel, edges: targetModel.edges.filter(e => e.kind !== "opaque") }, {}, MODULE_BOX);
  assert.deepEqual(withoutOpaque, target, "hiding opaque edges moves nothing");
});

test("placeModules (layered): saved positions still win", () => {
  const graph = moduleGraph([{ key: "ordering", dependsOn: ["catalog"] }, { key: "catalog", dependsOn: [] }]);
  const pos = placeModules(graph, { ordering: [7, 8] }, MODULE_BOX);
  assert.deepEqual(pos.ordering, [7, 8]);
  assert.equal(pos.catalog.length, 2);
});

test("freezeModulePositions: first drag freezes every shown module, keeps saved and unknown (hidden) keys untouched", () => {
  const saved = { hiddenOne: [9, 9], sales: [1, 2] };
  const shown = { sales: [100, 100], catalog: [300, 100], none: [0, 0] };
  const frozen = freezeModulePositions(saved, shown);
  assert.deepEqual(frozen, { hiddenOne: [9, 9], sales: [1, 2], catalog: [300, 100], none: [0, 0] });
  assert.deepEqual(saved, { hiddenOne: [9, 9], sales: [1, 2] }, "input untouched");
  const empty = freezeModulePositions({}, shown);
  assert.deepEqual(empty, shown);
});
