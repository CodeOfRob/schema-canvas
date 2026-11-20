import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeLayered } from "../src/viewer/layout-layered.js";

const BOX = { w: 220, h: 92 };
const GAPS = { gapX: 120, gapY: 110 };
// Graph-node shape of module-graph.js: { key, dependsOn?, unassigned? }.
const declared = spec => Object.entries(spec).map(([key, dependsOn]) => ({ key, dependsOn }));
const fk = pairs => pairs.map(([from, to]) => ({ from, to, kind: "fk" }));
const opaque = pairs => pairs.map(([from, to]) => ({ from, to, kind: "opaque" }));
const arrange = (nodes, edges = []) => arrangeLayered(nodes, edges, BOX, GAPS);

function overlaps(pos) {
  const keys = Object.keys(pos), found = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const [ax, ay] = pos[keys[i]], [bx, by] = pos[keys[j]];
    if (Math.abs(ax - bx) < BOX.w && Math.abs(ay - by) < BOX.h) found.push(keys[i] + "/" + keys[j]);
  }
  return found;
}
// Crossings of straight arrows between box centres (shared endpoints do not count).
function crossings(pos, pairs) {
  const centre = k => [pos[k][0] + BOX.w / 2, pos[k][1] + BOX.h / 2];
  const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  let count = 0;
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
    const [a, b] = pairs[i], [c, d] = pairs[j];
    if (new Set([a, b, c, d]).size < 4) continue;
    const [p1, p2, p3, p4] = [a, b, c, d].map(centre);
    if ((ccw(p3, p4, p1) > 0) !== (ccw(p3, p4, p2) > 0) && (ccw(p1, p2, p3) > 0) !== (ccw(p1, p2, p4) > 0)) count++;
  }
  return count;
}

test("layer = longest path down over dependsOn: foundation at the bottom, dependent modules higher up", () => {
  const pos = arrange(declared({ app: ["billing", "base"], billing: ["ordering"], ordering: ["base"], base: [] }));
  const y = k => pos[k][1];
  assert.ok(y("base") > y("ordering"), "base below ordering");
  assert.ok(y("ordering") > y("billing"), "ordering below billing");
  assert.ok(y("billing") > y("app"), "app sits above billing (longest path), not next to it via base");
  assert.equal(overlaps(pos).length, 0);
});

test("dependsOn: [] is an explicit foundation: same row as the other bottom modules", () => {
  const pos = arrange(declared({ top: ["a"], a: [], b: [] }));
  assert.equal(pos.a[1], pos.b[1]);
  assert.ok(pos.top[1] < pos.a[1]);
});

test("positions start at (0, 0), are integers and deterministic", () => {
  const nodes = declared({ c: ["a", "b"], a: [], b: ["a"] });
  const first = arrange(nodes);
  assert.deepEqual(arrange(nodes), first);
  assert.equal(Math.min(...Object.values(first).map(p => p[0])), 0);
  assert.equal(Math.min(...Object.values(first).map(p => p[1])), 0);
  for (const [x, y] of Object.values(first)) assert.ok(Number.isInteger(x) && Number.isInteger(y));
});

test("a module without dependsOn falls back to its foreign-key edges; opaque edges never count", () => {
  const nodes = [{ key: "base", dependsOn: [] }, { key: "loose" }, { key: "free" }];
  const pos = arrange(nodes, [...fk([["loose", "base"]]), ...opaque([["base", "free"], ["free", "loose"]])]);
  assert.ok(pos.loose[1] < pos.base[1], "loose sits above base through its foreign key");
  assert.equal(pos.free[1], pos.base[1], "free has only opaque edges: foundation row");
  assert.deepEqual(arrange(nodes, fk([["loose", "base"]])), pos, "opaque edges change nothing");
});

test("declared modules ignore their foreign-key edges: the arrangement follows the config alone", () => {
  const nodes = declared({ ordering: ["catalog"], catalog: [], billing: ["ordering"] });
  const alone = arrange(nodes);
  assert.deepEqual(arrange(nodes, fk([["catalog", "billing"], ["catalog", "ordering"], ["billing", "catalog"]])), alone);
});

test("cycles from the foreign-key fallback are broken deterministically, earlier config order wins", () => {
  const nodes = [{ key: "x" }, { key: "y" }, { key: "z" }];
  const edges = fk([["y", "x"], ["x", "y"], ["z", "y"]]);
  const pos = arrange(nodes, edges);
  assert.deepEqual(arrange(nodes, [...edges].reverse()), pos, "independent of edge order");
  assert.ok(pos.x[1] < pos.y[1], "x -> y kept (x comes first in the config), y -> x dropped");
  assert.ok(pos.z[1] < pos.y[1]);
  assert.equal(overlaps(pos).length, 0);
});

test("a fallback edge never overrules a declared dependency when they close a cycle", () => {
  // top declares loose; the undeclared loose has a foreign key back to top: the declared direction must stay.
  const nodes = [{ key: "loose" }, { key: "top", dependsOn: ["loose"] }, { key: "base", dependsOn: [] }];
  const pos = arrange(nodes, fk([["loose", "top"], ["loose", "base"]]));
  assert.ok(pos.top[1] < pos.loose[1], "declared top -> loose wins over the fallback loose -> top");
  assert.ok(pos.loose[1] < pos.base[1], "the non-cyclic fallback loose -> base stays");
});

test("dependsOn entries that are not shown (filtered modules) are ignored", () => {
  const pos = arrange(declared({ top: ["hidden", "base"], base: [] }));
  assert.ok(pos.top[1] < pos.base[1]);
  assert.deepEqual(Object.keys(pos).sort(), ["base", "top"]);
});

test("barycenter sweeps remove avoidable crossings", () => {
  // Config order alone draws p -> b2 and q -> b1 crossed.
  const nodes = declared({ p: ["b2"], q: ["b1"], b1: [], b2: [] });
  const pos = arrange(nodes);
  assert.equal(crossings(pos, [["p", "b2"], ["q", "b1"]]), 0);
});

test("ties inside a layer keep the config order", () => {
  const pos = arrange(declared({ d: [], a: [], c: [] }));
  assert.deepEqual(["d", "a", "c"].map(k => pos[k][0]), ["d", "a", "c"].map(k => pos[k][0]).sort((u, v) => u - v));
  // p -> b2 crosses y -> b1, so the sweeps run; y and x then share a barycenter and keep their config order.
  const swept = arrange(declared({ p: ["b2"], y: ["b1"], x: ["b1"], b1: [], b2: [] }));
  assert.ok(swept.y[0] < swept.x[0], "y before x as in the config");
  assert.ok(swept.x[0] < swept.p[0], "p moved right, over b2");
});

test("a very wide layer wraps into staggered sub-rows that keep the left-to-right order", () => {
  const keys = Array.from({ length: 12 }, (_, i) => "m" + String(i).padStart(2, "0"));
  const pos = arrange(keys.map(key => ({ key, dependsOn: [] })));
  const rows = new Set(keys.map(k => pos[k][1]));
  assert.ok(rows.size > 1, "split into sub-rows");
  for (const y of rows) assert.ok(keys.filter(k => pos[k][1] === y).length < keys.length / 2 + 1, "rows are balanced");
  assert.deepEqual([...keys].sort((a, b) => pos[a][0] - pos[b][0]), keys, "x order is the config order");
  assert.equal(overlaps(pos).length, 0);
  const width = Math.max(...keys.map(k => pos[k][0])) + BOX.w, height = Math.max(...keys.map(k => pos[k][1])) + BOX.h;
  assert.ok(width / height < 4, "no wide strip: " + width + " x " + height);
});

test("a narrow layer does not wrap", () => {
  const pos = arrange(declared({ a: [], b: [], top: ["a", "b"] }));
  assert.equal(pos.a[1], pos.b[1]);
});

test("(no module) stays outside the layers, right of everything, and does not move the layered modules", () => {
  const nodes = declared({ top: ["base"], base: [] });
  const without = arrange(nodes, fk([["top", "base"]]));
  const withNone = arrange([...nodes, { key: "none", unassigned: true }], fk([["top", "base"], ["none", "base"], ["top", "none"]]));
  assert.ok(withNone.none[0] >= Math.max(withNone.top[0], withNone.base[0]) + BOX.w, "right of the layers");
  assert.deepEqual({ top: withNone.top, base: withNone.base }, without);
  assert.equal(overlaps(withNone).length, 0);
});

test("empty input gives an empty map", () => {
  assert.deepEqual(arrange([]), {});
});
