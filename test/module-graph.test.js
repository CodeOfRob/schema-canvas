import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/model/page-data.js";
import { normalizeModel } from "../src/model/normalize.js";
import { classificationAxes, classify } from "../src/viewer/classify.js";
import { buildModuleGraph } from "../src/viewer/module-graph.js";
import { tileOf } from "../src/viewer/tiles.js";

const table = (name, module) => ({ name, ...(module ? { module } : {}), fields: [{ name: "id", type: "Int", pk: true }, { name: "refId", type: "Int", fk: true }] });
const ref = (from, to) => ({ from, to, fromFields: ["refId"], toFields: ["id"] });
const model = normalizeModel({
  version: 1,
  entities: [table("Book", "catalog"), table("Author", "catalog"), table("Order", "ordering"), table("OrderLine", "ordering"), table("Invoice", "billing"), table("Account"), table("Note")],
  relations: [
    ref("Book", "Author"), ref("Order", "Account"), ref("OrderLine", "Order"), ref("OrderLine", "Book"), ref("Book", "Author"),
    ref("Invoice", "Order"), ref("Invoice", "Book"), ref("Order", "Invoice"), ref("Note", "Book"), ref("Invoice", "Account"),
  ].map((r, i) => ({ ...r, id: "r" + i })),
});
const LAYERS = { catalog: { label: "Catalog", color: "#0060a3" }, ordering: { label: "Ordering", dependsOn: ["catalog"] }, billing: { label: "Billing", dependsOn: ["ordering"] }, shipping: { label: "Shipping" } };

function graph(modules, tileTables = []) {
  const config = normalizeConfig({ modules, entityModules: { Account: "none" } });
  const axis = classificationAxes(config).module;
  const displays = new Map(tileTables.map(name => [name, "badge"]));
  return buildModuleGraph(model, { modules: config.modules, moduleOf: e => classify(e, axis), tileOf: r => tileOf(model, r, displays) });
}
const edge = (g, from, to) => g.edges.find(e => e.from === from && e.to === to);

test("one node per configured module in config order, unassigned tables last, with table counts", () => {
  const g = graph(LAYERS);
  assert.deepEqual(g.nodes.map(n => [n.key, n.tableCount]), [["catalog", 2], ["ordering", 2], ["billing", 1], ["shipping", 0], ["none", 2]]);
  assert.equal(g.nodes[0].label, "Catalog");
  assert.equal(g.nodes[0].color, "#0060a3");
  assert.equal(g.nodes.at(-1).unassigned, true);
  assert.deepEqual(g.nodes.find(n => n.key === "ordering").entityIds, ["Order", "OrderLine"]);
});

test("edges between modules carry every relation; relations inside a module only count on the node", () => {
  const g = graph(LAYERS);
  assert.deepEqual(edge(g, "ordering", "catalog").relations, ["r3"]);
  assert.deepEqual(edge(g, "billing", "ordering").relations, ["r5"]);
  assert.deepEqual(edge(g, "ordering", "none").relations, ["r1"]);
  assert.equal(edge(g, "catalog", "catalog"), undefined);
  assert.equal(g.nodes.find(n => n.key === "catalog").internalRelationCount, 2);
  assert.equal(g.nodes.find(n => n.key === "ordering").internalRelationCount, 1);
  assert.deepEqual(g.edges.map(e => e.from + ">" + e.to), ["ordering>catalog", "ordering>billing", "ordering>none", "billing>catalog", "billing>ordering", "billing>none", "none>catalog"]);
});

test("relations to tile tables (tile or badge) are no edge; they count as hidden on the referencing table's module", () => {
  const g = graph(LAYERS, ["Account"]);
  assert.equal(edge(g, "ordering", "none"), undefined);
  assert.equal(edge(g, "billing", "none"), undefined);
  assert.equal(g.nodes.find(n => n.key === "ordering").hiddenRelationCount, 1);
  assert.equal(g.nodes.find(n => n.key === "billing").hiddenRelationCount, 1);
  assert.equal(g.nodes.find(n => n.key === "catalog").hiddenRelationCount, 0);
  assert.equal(g.nodes.find(n => n.key === "none").tableCount, 2, "the tile table still belongs to its module");
});

test("violations follow the transitive closure of dependsOn; edges in a module cycle are always marked", () => {
  const g = graph(LAYERS);
  assert.equal(g.layered, true);
  assert.equal(edge(g, "ordering", "catalog").violation, null, "declared");
  assert.equal(edge(g, "billing", "catalog").violation, null, "allowed through ordering (transitive)");
  assert.equal(edge(g, "billing", "ordering").violation, "cycle");
  assert.equal(edge(g, "ordering", "billing").violation, "cycle");
  assert.equal(edge(g, "ordering", "none").violation, null, "tables without module have no rule");
  assert.equal(edge(g, "none", "catalog").violation, null);
});

test("a module without dependsOn is not judged, an empty dependsOn forbids every outgoing edge", () => {
  const free = graph({ catalog: { label: "Catalog", dependsOn: [] }, ordering: { label: "Ordering" }, billing: { label: "Billing", dependsOn: ["catalog"] } });
  assert.equal(edge(free, "ordering", "catalog").violation, null, "ordering declares nothing");
  assert.equal(edge(free, "billing", "catalog").violation, null);
  assert.equal(edge(free, "billing", "ordering").violation, "cycle");
  const strict = graph({ catalog: { label: "Catalog", dependsOn: [] }, ordering: { label: "Ordering", dependsOn: ["billing"] }, billing: { label: "Billing", dependsOn: [] } });
  assert.equal(edge(strict, "ordering", "catalog").violation, "not-allowed");
  assert.equal(edge(strict, "ordering", "billing").violation, "cycle");
});

test("longer cycles are marked too, not only pairs", () => {
  const cyclic = normalizeModel({
    version: 1,
    entities: [table("A1", "a"), table("B1", "b"), table("C1", "c")],
    relations: [ref("A1", "B1"), ref("B1", "C1"), ref("C1", "A1")],
  });
  const modules = normalizeConfig({ modules: { a: { label: "A", dependsOn: ["b"] }, b: { label: "B", dependsOn: ["c"] }, c: { label: "C" } } }).modules;
  const axis = classificationAxes({ dataKinds: {}, entityKinds: {}, modules, entityModules: {} }).module;
  const g = buildModuleGraph(cyclic, { modules, moduleOf: e => classify(e, axis), tileOf: () => null });
  assert.deepEqual(g.edges.map(e => e.violation), ["cycle", "cycle", "cycle"]);
});

test("without any dependsOn nothing is marked, not even cycles (no guessing)", () => {
  const g = graph({ catalog: { label: "Catalog" }, ordering: { label: "Ordering" }, billing: { label: "Billing" } });
  assert.equal(g.layered, false);
  assert.ok(g.edges.length > 0);
  assert.deepEqual(g.edges.filter(e => e.violation), []);
});

test("without modules every table lands in the unassigned node", () => {
  const g = buildModuleGraph(model, { modules: {}, moduleOf: () => null, tileOf: () => null });
  assert.deepEqual(g.nodes.map(n => [n.key, n.tableCount, n.internalRelationCount]), [["none", 7, 10]]);
  assert.deepEqual(g.edges, []);
});

test("foreign keys OF a badge table stay edges (with their violations); only references TO it are hidden", () => {
  const badgeModel = normalizeModel({
    version: 1,
    entities: [table("Member", "accounts"), table("Asset", "media"), table("Order", "ordering")],
    relations: [ref("Member", "Asset"), ref("Order", "Member")],
  });
  const modules = normalizeConfig({ modules: { media: { label: "Media", dependsOn: [] }, accounts: { label: "Accounts", dependsOn: [] }, ordering: { label: "Ordering", dependsOn: ["accounts"] } } }).modules;
  const axis = classificationAxes({ dataKinds: {}, entityKinds: {}, modules, entityModules: {} }).module;
  const displays = new Map([["Member", "badge"]]);
  const g = buildModuleGraph(badgeModel, { modules, moduleOf: e => classify(e, axis), tileOf: r => tileOf(badgeModel, r, displays) });
  assert.deepEqual(g.edges.map(e => [e.key, e.relations.length, e.violation]), [["accounts->media", 1, "not-allowed"]]);
  assert.equal(g.nodes.find(n => n.key === "ordering").hiddenRelationCount, 1);
  assert.equal(g.nodes.find(n => n.key === "accounts").hiddenRelationCount, 0);
});
