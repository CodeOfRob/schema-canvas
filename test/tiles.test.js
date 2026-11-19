import { test } from "node:test";
import assert from "node:assert/strict";
import { tileDisplaysFrom, tileOf } from "../src/viewer/tiles.js";

const model = {
  entities: ["Account", "Order", "Shelf", "Book"].map(name => ({ id: name, name, fields: [] })),
};
const rel = (from, to) => ({ id: from + "->" + to, from, to, fromFields: [], toFields: [] });

test("tileOf: a relation touching exactly one tile table is not a line, with that table's display", () => {
  const displays = new Map([["Account", "badge"], ["Shelf", "tile"]]);
  assert.deepEqual(tileOf(model, rel("Order", "Account"), displays), { tile: model.entities[0], other: "Order", display: "badge" });
  assert.deepEqual(tileOf(model, rel("Shelf", "Book"), displays), { tile: model.entities[2], other: "Book", display: "tile" });
  assert.equal(tileOf(model, rel("Order", "Book"), displays), null, "no tile table: a line");
  assert.equal(tileOf(model, rel("Shelf", "Book"), new Map([["Shelf", "tile"], ["Book", "tile"]])), null, "two tile tables: a line");
  assert.equal(tileOf(model, rel("Account", "Account"), displays), null, "self relation: a line");
});

test("tileDisplaysFrom: stored per-viewer choice wins, old name lists mean tiles, anything else falls back to the config", () => {
  const config = [{ name: "Account", display: "badge" }];
  assert.deepEqual([...tileDisplaysFrom(null, config)], [["Account", "badge"]]);
  assert.deepEqual([...tileDisplaysFrom({ Shelf: "tile", Account: "badge" }, config)], [["Shelf", "tile"], ["Account", "badge"]]);
  assert.deepEqual([...tileDisplaysFrom(["Shelf"], config)], [["Shelf", "tile"]]);
  assert.deepEqual([...tileDisplaysFrom({}, config)], [], "an empty stored choice is a choice");
  assert.deepEqual([...tileDisplaysFrom({ Shelf: "line" }, config)], [["Account", "badge"]], "invalid stored value: config default");
  assert.deepEqual([...tileDisplaysFrom([3], config)], [["Account", "badge"]]);
  assert.deepEqual([...tileDisplaysFrom("Shelf", config)], [["Account", "badge"]]);
});

test("tileOf badge: only references TO a badge table are badges; its own foreign keys stay lines", () => {
  const displays = new Map([["Account", "badge"], ["Book", "badge"], ["Shelf", "tile"]]);
  assert.deepEqual(tileOf(model, rel("Order", "Account"), displays), { tile: model.entities[0], other: "Order", display: "badge" });
  assert.equal(tileOf(model, rel("Account", "Order"), displays), null, "badge table -> plain table: a line");
  assert.deepEqual(tileOf(model, rel("Account", "Book"), displays), { tile: model.entities[3], other: "Account", display: "badge" }, "both badge tables: a badge on the from side");
  assert.deepEqual(tileOf(model, rel("Shelf", "Account"), displays), { tile: model.entities[0], other: "Shelf", display: "badge" }, "tile table -> badge table: a badge");
  assert.equal(tileOf(model, rel("Account", "Shelf"), displays), null, "badge table -> tile table: a line, as before");
});
