import { test } from "node:test";
import assert from "node:assert/strict";
import { convexHull } from "../src/viewer/geometry.js";
import { MODULE_AREA_JOIN_GAP, areaPath, moduleAreas } from "../src/viewer/module-areas.js";
import { arrangeForces } from "../src/viewer/layout-force.js";
import { largeModel } from "./large-model.js";

const box = (x, y, module, w = 100, h = 60) => ({ x, y, w, h, module });

test("convexHull: the outline of the points, counter-clockwise from the lowest x; inner and collinear points dropped", () => {
  assert.deepEqual(convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0]]), [[0, 0], [2, 0], [2, 2], [0, 2]]);
  assert.deepEqual(convexHull([[5, 5]]), [[5, 5]]);
});

test("one area per module island: the hull of its tables' corners; tables without a module get none", () => {
  const areas = moduleAreas([box(0, 0, "a"), box(150, 0, "a"), box(0, 100, null)], ["a"]);
  assert.deepEqual(areas, [{ module: "a", hull: [[0, 0], [250, 0], [250, 60], [0, 60]] }]);
});

test("tables of one module further apart than the join gap get separate areas, in module order then input order", () => {
  const far = 100 + MODULE_AREA_JOIN_GAP + 1;
  const areas = moduleAreas([box(0, 0, "b"), box(far, 0, "a"), box(0, 0, "a")], ["a", "b"]);
  assert.deepEqual(areas.map(a => [a.module, a.hull[0]]), [["a", [far, 0]], ["a", [0, 0]], ["b", [0, 0]]]);
});

test("a module not in the order (or a page without modules) draws nothing", () => {
  assert.deepEqual(moduleAreas([box(0, 0, "x")], []), []);
});

test("areaPath: a closed polygon through the hull points", () => {
  assert.equal(areaPath([[0, 0], [10, 0], [10, 5]]), "M0 0L10 0L10 5Z");
});

test("on the force layout of the 130-table fixture few tables sit under another module's area", () => {
  // Guard for the chosen shape (hull per island): measured 7 % of the table area under a foreign area here, against
  // 40 % for one hull per module and 61 % for bounding boxes. Counted by table centre (cheap) instead of area.
  const model = largeModel(), hubs = new Set(model.hubTables);
  const relations = model.relations.filter(r => !hubs.has(r.from) && !hubs.has(r.to));
  const { pos } = arrangeForces(model.boxes, relations, { moduleOf: model.moduleOf });
  const boxes = model.boxes.map(b => ({ id: b.id, x: pos[b.id][0], y: pos[b.id][1], w: b.w, h: b.h, module: model.moduleOf(b.id) }));
  const order = [...new Set(boxes.map(b => b.module).filter(Boolean))];
  const areas = moduleAreas(boxes, order);
  const inside = (hull, [px, py]) => hull.length > 2 && hull.every((a, i) => { const b = hull[(i + 1) % hull.length]; return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) >= 0; });
  const under = boxes.filter(b => areas.some(a => a.module !== b.module && inside(a.hull, [b.x + b.w / 2, b.y + b.h / 2])));
  assert.ok(under.length / boxes.length < 0.1, under.length + " of " + boxes.length + " table centres under a foreign area");
});
