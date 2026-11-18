import { test } from "node:test";
import assert from "node:assert/strict";
import { S, STATUS_LABEL, applyStringOverrides, checkStringOverrides } from "../src/viewer/strings.js";

test("unknown keys and placeholders beyond the arguments are reported", () => {
  assert.deepEqual(checkStringOverrides({ addTable: "+ Tabelle", "status.added": "neu", "fieldFlags.list": "Liste" }), []);
  assert.deepEqual(checkStringOverrides({ nope: "x", "status.nope": "x", fieldFlags: "x", "a.b.c": "x" }), [
    "strings: unknown key \"nope\"", "strings: unknown key \"status.nope\"", "strings: unknown key \"fieldFlags\"", "strings: unknown key \"a.b.c\"",
  ]);
  assert.deepEqual(checkStringOverrides({ nameTaken: "{0} gibt es schon {1}" }), ["strings.nameTaken: placeholder {1} but the text gets 1 value(s)"]);
  assert.throws(() => applyStringOverrides({ nope: "x" }), /unknown key "nope"/);
});

test("overrides replace plain texts, nested tables and texts with values", () => {
  applyStringOverrides({ addTable: "+ Tabelle", "status.added": "neu", "fieldFlags.list": "Liste", counts: "{0}: {1} Tabellen · {2} Beziehungen · {3} Indizes" });
  assert.equal(S.addTable, "+ Tabelle");
  assert.equal(STATUS_LABEL.added, "neu");
  assert.equal(S.fieldFlags.list, "Liste");
  assert.equal(S.counts("Soll", 3, 2, 1), "Soll: 3 Tabellen · 2 Beziehungen · 1 Indizes");
});
