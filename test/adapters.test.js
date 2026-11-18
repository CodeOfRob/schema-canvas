import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { prismaSourceToModel, prepareDatamodel, readPrismaSource } from "../src/adapters/prisma.js";
import { tblsToModel } from "../src/adapters/tbls.js";
import { normalizeModel } from "../src/model/normalize.js";
import { assertGolden } from "./golden.js";

const fixture = name => fileURLToPath(new URL("./fixtures/" + name, import.meta.url));

test("prisma adapter maps the fixture schema onto the golden model", async () => {
  const model = await prismaSourceToModel(await readPrismaSource(fixture("library.prisma")), "library");
  normalizeModel(model, "prisma golden");
  await assertGolden(model, fixture("library.expected.json"));
});

test("prisma adapter strips connection urls and adds a datasource when none exists", () => {
  const legacy = 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n  directUrl = env("DIRECT")\n}\nmodel A {\n  id Int @id\n}\n';
  assert.doesNotMatch(prepareDatamodel(legacy), /url\s*=/i);
  assert.match(prepareDatamodel("model A {\n  id Int @id\n}\n"), /^datasource db \{\n {2}provider = "postgresql"\n\}/);
});

test("prisma adapter surfaces parser errors instead of returning an empty model", async () => {
  await assert.rejects(prismaSourceToModel("model Broken {\n  id Int @id\n  other Missing\n}\n"), /Missing/);
});

test("tbls adapter maps the fixture document onto the golden model", async () => {
  const doc = JSON.parse(await readFile(fixture("shop.tbls.json"), "utf8"));
  const model = tblsToModel(doc);
  normalizeModel(model, "tbls golden");
  await assertGolden(model, fixture("shop.expected.json"));
});

test("tbls adapter rejects documents without tables", () => {
  assert.throws(() => tblsToModel({ name: "x" }), /tbls out -t json/);
});
