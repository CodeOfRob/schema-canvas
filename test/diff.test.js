import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeModel } from "../src/model/normalize.js";
import { computeDiff, countStatuses } from "../src/viewer/diff.js";

const field = (name, extra = {}) => ({ name, type: "String", ...extra });
const current = normalizeModel({
  version: 1,
  entities: [
    { name: "Writer", fields: [field("id", { pk: true }), field("penName")] },
    { name: "Shelf", fields: [field("id", { pk: true }), field("label")] },
    { name: "Rack", fields: [field("id", { pk: true }), field("label"), field("rackNo")] },
    { name: "Title", fields: [field("id", { pk: true }), field("writerId", { fk: true }), field("price"), field("legacyCode")] },
    { name: "Unused", fields: [field("id", { pk: true })] },
  ],
  relations: [{ from: "Title", to: "Writer", fromFields: ["writerId"], toFields: ["id"] }],
});
const target = normalizeModel({
  version: 1,
  entities: [
    // renamed entity, renamed field
    { name: "Author", origin: ["Writer"], fields: [field("id", { pk: true, origin: ["Writer.id"] }), field("displayName", { origin: ["Writer.penName"] })] },
    // merged entity
    { name: "Location", origin: ["Shelf", "Rack"], fields: [field("id", { pk: true, origin: ["Shelf.id", "Rack.id"] }), field("label", { origin: ["Shelf.label", "Rack.label"] })] },
    // implicit origin by name; changed field type; moved field in; legacyCode dropped
    { name: "Title", fields: [field("id", { pk: true }), field("writerId", { fk: true }), field("price", { type: "Decimal" }), field("rackNo", { origin: ["Rack.rackNo"] })] },
    // explicit empty origin: new despite no counterpart
    { name: "Review", origin: [], fields: [field("id", { pk: true })] },
  ],
  relations: [
    { from: "Title", to: "Author", fromFields: ["writerId"], toFields: ["id"] },
    { from: "Review", to: "Title", fromFields: ["id"], toFields: ["id"], cardinality: { from: "0..1", to: "1" } },
  ],
});

test("entity statuses follow origin[] on both sides", () => {
  const d = computeDiff(current, target);
  assert.deepEqual(d.target.entities.Author, { status: "renamed", origin: ["Writer"] });
  assert.deepEqual(d.target.entities.Location, { status: "merged", origin: ["Shelf", "Rack"] });
  assert.equal(d.target.entities.Title.status, "changed");
  assert.equal(d.target.entities.Review.status, "added");
  assert.deepEqual(d.current.entities.Writer, { status: "renamed", to: ["Author"] });
  assert.equal(d.current.entities.Shelf.status, "merged");
  assert.equal(d.current.entities.Unused.status, "removed");
  assert.equal(d.current.entities.Title.status, "changed");
});

test("field statuses: renamed, moved, changed, removed, same", () => {
  const d = computeDiff(current, target);
  assert.equal(d.target.fields["Author.displayName"], "renamed");
  assert.equal(d.target.fields["Title.price"], "changed");
  assert.equal(d.target.fields["Title.rackNo"], "moved");
  assert.equal(d.target.fields["Title.id"], "same");
  assert.deepEqual(d.current.fields["Title.legacyCode"], { status: "removed", to: [] });
  assert.deepEqual(d.current.fields["Rack.rackNo"], { status: "moved", to: ["Title.rackNo"] });
  assert.deepEqual(d.current.fields["Writer.penName"], { status: "renamed", to: ["Author.displayName"] });
});

test("relations are matched through renamed endpoints", () => {
  const d = computeDiff(current, target);
  assert.equal(d.target.relations["Title.writerId->Author"], "same");
  assert.equal(d.current.relations["Title.writerId->Writer"], "same");
  assert.equal(d.target.relations["Review.id->Title"], "added");
});

test("a changed cardinality marks the relation as changed", () => {
  const changed = normalizeModel({ ...target, relations: [{ from: "Title", to: "Author", fromFields: ["writerId"], toFields: ["id"], cardinality: { from: "0..1", to: "1" } }] });
  const d = computeDiff(current, changed);
  assert.equal(d.target.relations["Title.writerId->Author"], "changed");
});

test("unknown origin refs are reported, not silently dropped", () => {
  const broken = normalizeModel({ version: 1, entities: [{ name: "Author", origin: ["Nope"], fields: [field("id", { origin: ["Writer.missing"] })] }] });
  const d = computeDiff(current, broken);
  assert.deepEqual(d.unresolvedOrigins, [{ where: "Author", ref: "Nope" }, { where: "Author.id", ref: "Writer.missing" }]);
  assert.equal(d.target.entities.Author.status, "added");
});

test("countStatuses sums entity statuses per side", () => {
  const counts = countStatuses(computeDiff(current, target));
  assert.deepEqual(counts.target, { renamed: 1, merged: 1, changed: 1, added: 1 });
  assert.deepEqual(counts.current, { renamed: 1, merged: 2, changed: 1, removed: 1 });
});

test("changed: true marks a field as changed although its compared properties are equal", () => {
  const flagged = normalizeModel({ ...target, entities: target.entities.map(e => (e.name === "Title" ? { ...e, fields: e.fields.map(f => (f.name === "writerId" ? { ...f, changed: true } : f)) } : e)) });
  const d = computeDiff(current, flagged);
  assert.equal(d.target.fields["Title.writerId"], "changed");
  assert.equal(d.current.fields["Title.writerId"].status, "changed");
  assert.equal(computeDiff(current, target).target.fields["Title.writerId"], "same");
});

test("every relation gets a status when two merged tables referenced the same table", () => {
  const before = normalizeModel({
    version: 1,
    entities: [
      { name: "Writer", fields: [field("id", { pk: true })] },
      { name: "Shelf", fields: [field("id", { pk: true }), field("writerId", { fk: true })] },
      { name: "Rack", fields: [field("id", { pk: true }), field("writerId", { fk: true })] },
    ],
    relations: [
      { from: "Shelf", to: "Writer", fromFields: ["writerId"] },
      { from: "Rack", to: "Writer", fromFields: ["writerId"], cardinality: { from: "0..1", to: "1" } },
    ],
  });
  const after = normalizeModel({
    version: 1,
    entities: [
      { name: "Writer", fields: [field("id", { pk: true })] },
      { name: "Location", origin: ["Shelf", "Rack"], fields: [field("id", { pk: true, origin: ["Shelf.id", "Rack.id"] }), field("writerId", { fk: true, origin: ["Shelf.writerId", "Rack.writerId"] })] },
    ],
    relations: [{ from: "Location", to: "Writer", fromFields: ["writerId"] }],
  });
  const d = computeDiff(before, after);
  assert.deepEqual(d.current.relations, { "Shelf.writerId->Writer": "same", "Rack.writerId->Writer": "changed" });
  assert.deepEqual(d.target.relations, { "Location.writerId->Writer": "same" });
});

test("a field whose only difference is the fk flag counts as changed", () => {
  const withoutFk = normalizeModel({ version: 1, entities: [{ name: "Title", fields: [field("id", { pk: true }), field("writerId", { fk: true })] }], relations: [] });
  const dropped = normalizeModel({ version: 1, entities: [{ name: "Title", fields: [field("id", { pk: true }), field("writerId")] }], relations: [] });
  const d = computeDiff(withoutFk, dropped);
  assert.equal(d.target.fields["Title.writerId"], "changed");
  assert.equal(d.current.fields["Title.writerId"].status, "changed");
  assert.equal(d.target.fields["Title.id"], "same");
});

test("data kind and module are classification, not schema: changing them leaves the diff unchanged", () => {
  const entity = extra => ({ name: "Book", ...extra, fields: [{ name: "id", type: "Int", pk: true }] });
  const current = normalizeModel({ version: 1, entities: [entity({ kind: "catalog", module: "catalog" })] });
  const target = normalizeModel({ version: 1, entities: [entity({ kind: "sales", module: "ordering" })] });
  const diff = computeDiff(current, target);
  assert.equal(diff.target.entities.Book.status, "same");
  assert.equal(diff.current.entities.Book.status, "same");
});
