import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/model/page-data.js";
import { classificationAxes, classify } from "../src/viewer/classify.js";

const config = normalizeConfig({
  dataKinds: { catalog: { label: "Catalog" }, sales: { label: "Sales" } },
  entityKinds: { Book: "catalog", Customer: "sales", Draft: "none" },
  modules: { catalog: { label: "Catalog" }, ordering: { label: "Ordering", dependsOn: ["catalog"] } },
  entityModules: { Book: "catalog", Customer: "ordering", Draft: "none" },
});
const { kind, module } = classificationAxes(config);
const entity = (name, extra = {}) => ({ id: name, name, fields: [], ...extra });

for (const [axisName, axis, own, byName] of [["kind", kind, "sales", "catalog"], ["module", module, "ordering", "catalog"]]) {
  test(axisName + ": own value wins, then the config map by name, then the first assigned origin", () => {
    assert.equal(classify(entity("Book", { [axisName]: own }), axis), own);
    assert.equal(classify(entity("Book"), axis), byName);
    assert.equal(classify(entity("Account", { origin: ["Draft", "Customer"] }), axis), axisName === "kind" ? "sales" : "ordering");
    assert.equal(classify(entity("Account"), axis), null);
  });

  test(axisName + ": an unknown own value is ignored, \"none\" overrides the map, ignoreOwn shows the automatic value", () => {
    assert.equal(classify(entity("Book", { [axisName]: "unknown" }), axis), byName);
    assert.equal(classify(entity("Book", { [axisName]: "none" }), axis), null);
    assert.equal(classify(entity("Book", { [axisName]: "none" }), axis, { ignoreOwn: true }), byName);
    assert.equal(classify(entity("Draft", { origin: ["Book"] }), axis), null, "\"none\" by name stops the origin fallback");
  });
}

test("the two axes are independent: the kind map never answers for the module", () => {
  const onlyKinds = classificationAxes(normalizeConfig({ dataKinds: { catalog: { label: "Catalog" } }, entityKinds: { Book: "catalog" } }));
  assert.equal(classify(entity("Book"), onlyKinds.kind), "catalog");
  assert.equal(classify(entity("Book", { kind: "catalog" }), onlyKinds.module), null);
});
