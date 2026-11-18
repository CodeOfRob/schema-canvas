#!/usr/bin/env node
// schema-canvas CLI: schema -> model.json -> one self-contained HTML page.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { prismaSourceToModel, readPrismaSource } from "../src/adapters/prisma.js";
import { tblsToModel } from "../src/adapters/tbls.js";
import { buildPage } from "../src/build/page.js";
import { normalizeModel, toDocument } from "../src/model/normalize.js";
import { normalizeConfig, normalizeLayout } from "../src/model/page-data.js";
import { computeDiff } from "../src/viewer/diff.js";

const USAGE = `schema-canvas - interactive ER diagrams with a current-vs-target diff

Usage:
  schema-canvas model (--prisma <file|dir> | --tbls <schema.json>) [--name <name>] -o <model.json>
  schema-canvas build (--current <model.json> | --prisma <file|dir> | --tbls <schema.json>)
                      [--target <target.model.json>] [--layout <layout.json>] [--config <config.json>]
                      -o <page.html>

Options:
  --prisma   Prisma schema file, or a directory of .prisma files (multi-file schema)
  --tbls     JSON written by \`tbls out -t json\` (PostgreSQL, MySQL, SQLite, ...)
  --current  model.json of the current state
  --target   model.json of the target state; enables the diff view and the editor
  --layout   layout.json with table positions (export it from the page via More -> Export layout)
  --config   config.json (title, data kinds, tile tables, notes, storage)
  --name     model name stored in model.json
  -o, --out  output file
  -h, --help show this help
`;

const options = {
  prisma: { type: "string" }, tbls: { type: "string" }, current: { type: "string" }, target: { type: "string" },
  layout: { type: "string" }, config: { type: "string" }, name: { type: "string" }, out: { type: "string", short: "o" }, help: { type: "boolean", short: "h" },
};

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error("cannot read " + path + ": " + error.message, { cause: error });
  }
}

async function modelFromSource(values, allowed) {
  const sources = allowed.filter(k => values[k]);
  if (sources.length !== 1) throw new Error("give exactly one of " + allowed.map(k => "--" + k).join(", "));
  if (values.prisma) return prismaSourceToModel(await readPrismaSource(values.prisma), values.name || "");
  if (values.tbls) return tblsToModel(await readJson(values.tbls), values.name || "");
  return readJson(values.current);
}

async function writeOutput(path, content) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, content);
}

async function runModel(values) {
  if (!values.out) throw new Error("missing -o <model.json>");
  const model = normalizeModel(await modelFromSource(values, ["prisma", "tbls"]), "generated model");
  await writeOutput(values.out, JSON.stringify(toDocument(model), null, 2) + "\n");
  console.log("wrote " + values.out + " (" + model.entities.length + " tables, " + model.relations.length + " relations)");
}

async function runBuild(values) {
  if (!values.out) throw new Error("missing -o <page.html>");
  const current = normalizeModel(await modelFromSource(values, ["current", "prisma", "tbls"]), values.current || "current model");
  const target = values.target ? normalizeModel(await readJson(values.target), values.target) : null;
  const layout = values.layout ? normalizeLayout(await readJson(values.layout), values.layout) : undefined;
  const config = normalizeConfig(values.config ? await readJson(values.config) : {}, values.config || "config");
  if (target) {
    for (const u of computeDiff(current, target).unresolvedOrigins) console.warn("warning: origin \"" + u.ref + "\" of " + u.where + " is not in the current model");
  }
  const html = await buildPage({ current, ...(target ? { target } : {}), ...(layout ? { layout } : {}), config });
  await writeOutput(values.out, html);
  console.log("wrote " + values.out + " (" + Math.round(html.length / 1024) + " KB)");
}

async function main(argv) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({ args: rest, options, allowPositionals: false });
  if (!command || values.help || command === "help" || command === "--help" || command === "-h") { process.stdout.write(USAGE); return; }
  if (command === "model") return runModel(values);
  if (command === "build") return runBuild(values);
  throw new Error("unknown command \"" + command + "\"\n\n" + USAGE);
}

main(process.argv.slice(2)).catch(error => {
  console.error("schema-canvas: " + error.message);
  process.exitCode = 1;
});
