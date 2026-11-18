// Prisma adapter: the official parser (@prisma/internals getDMMF) reads the schema, this module only maps
// the DMMF document onto model.json. No own parsing of Prisma syntax beyond stripping connection settings.
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import internals from "@prisma/internals";
import { MODEL_FORMAT_VERSION } from "../model/normalize.js";

const CONNECTION_PROPERTY = /^\s*(url|directUrl|shadowDatabaseUrl)\s*=.*$/gm;
const DATASOURCE_BLOCK = /datasource\s+\w+\s*\{[^}]*\}/g;
const HAS_DATASOURCE = /datasource\s+\w+\s*\{/;

// Prisma 7 rejects `url = env(...)` inside the schema, older schemas still carry it. Connection settings
// do not change the structure, so they are removed before parsing. Without any datasource the parser
// would reject scalar lists, so a neutral PostgreSQL one is added.
export function prepareDatamodel(source) {
  const withoutUrls = source.replace(DATASOURCE_BLOCK, block => block.replace(CONNECTION_PROPERTY, ""));
  return HAS_DATASOURCE.test(withoutUrls) ? withoutUrls : 'datasource db {\n  provider = "postgresql"\n}\n' + withoutUrls;
}

async function listPrismaFiles(dir) {
  const out = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listPrismaFiles(path)));
    else if (entry.name.endsWith(".prisma")) out.push(path);
  }
  return out;
}

/** Reads one .prisma file or every .prisma file below a directory (multi-file schemas). */
export async function readPrismaSource(path) {
  const files = (await stat(path)).isDirectory() ? await listPrismaFiles(path) : [path];
  if (!files.length) throw new Error("No .prisma files found in " + path);
  return (await Promise.all(files.map(file => readFile(file, "utf8")))).join("\n");
}

function formatDefault(field) {
  const value = field.default;
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return "[" + value.map(v => formatDefault({ ...field, default: v })).join(", ") + "]";
  if (typeof value === "object") return value.name + "(" + (value.args || []).map(a => JSON.stringify(a)).join(", ") + ")";
  if (field.kind === "scalar" && field.type === "String") return JSON.stringify(value);
  return String(value);
}

function isColumnField(field) {
  return field.kind === "scalar" || field.kind === "enum" || field.kind === "unsupported";
}

// True when the given columns are unique on their own (then the referencing side is 0..1, not n).
function isUniqueSet(model, columns) {
  const same = list => list.length === columns.length && list.every(c => columns.includes(c));
  if (columns.length === 1) {
    const field = model.fields.find(f => f.name === columns[0]);
    if (field && (field.isUnique || field.isId)) return true;
  }
  return (model.primaryKey && same(model.primaryKey.fields)) || (model.uniqueFields || []).some(same);
}

function mapEntity(model, foreignKeyColumns) {
  const compositePk = new Set(model.primaryKey ? model.primaryKey.fields : []);
  const entity = { id: model.name, name: model.name };
  if (model.documentation) entity.note = model.documentation;
  entity.fields = model.fields.filter(isColumnField).map(f => {
    const field = { name: f.name, type: f.type, nullable: !f.isRequired };
    if (f.isList) field.list = true;
    const fallback = formatDefault(f);
    if (fallback !== undefined) field.default = fallback;
    if (f.isId || compositePk.has(f.name)) field.pk = true;
    if (f.isUnique) field.uk = true;
    if (foreignKeyColumns.has(f.name)) field.fk = true;
    if (f.documentation) field.note = f.documentation;
    return field;
  });
  return entity;
}

/** Maps a DMMF document (from getDMMF) onto model.json. */
function dmmfToModel(dmmf, name = "") {
  const models = dmmf.datamodel.models;
  const byName = new Map(models.map(m => [m.name, m]));
  const relations = [];
  const manyToMany = new Set();
  const foreignKeys = new Map(models.map(m => [m.name, new Set()]));
  for (const model of models) {
    for (const f of model.fields) {
      if (f.kind !== "object") continue;
      const fromFields = f.relationFromFields || [];
      if (fromFields.length) {
        fromFields.forEach(c => foreignKeys.get(model.name).add(c));
        relations.push({
          id: model.name + "." + f.name,
          from: model.name,
          to: f.type,
          fromFields: [...fromFields],
          toFields: [...(f.relationToFields || [])],
          cardinality: { from: isUniqueSet(model, fromFields) ? "0..1" : "n", to: f.isRequired ? "1" : "0..1" },
        });
        continue;
      }
      // Implicit many-to-many: both sides are lists and neither holds the foreign key. Emit it once.
      const other = byName.get(f.type);
      const back = other && other.fields.find(x => x.relationName === f.relationName && x !== f);
      if (f.isList && back && back.isList && !manyToMany.has(f.relationName)) {
        manyToMany.add(f.relationName);
        const [from, to] = [model.name, f.type].sort();
        relations.push({ id: "m2m:" + f.relationName, from, to, fromFields: [], toFields: [], cardinality: { from: "n", to: "n" }, label: f.relationName });
      }
    }
  }
  const indexes = [];
  for (const index of dmmf.datamodel.indexes || []) {
    if (index.type === "id") continue;
    const fields = index.fields.map(f => f.name);
    // A single-field @unique is already shown as the field's UK marker.
    if (index.type === "unique" && index.isDefinedOnField && fields.length === 1) continue;
    const entry = { entity: index.model, fields, unique: index.type === "unique" };
    if (index.name || index.dbName) entry.name = index.name || index.dbName;
    indexes.push(entry);
  }
  return {
    version: MODEL_FORMAT_VERSION,
    name,
    entities: models.map(m => mapEntity(m, foreignKeys.get(m.name))),
    relations,
    indexes,
    enums: dmmf.datamodel.enums.map(e => ({ name: e.name, values: e.values.map(v => v.name) })),
  };
}

/** Parses Prisma schema source text with the official parser and maps it onto model.json. */
export async function prismaSourceToModel(source, name = "") {
  const dmmf = await internals.getDMMF({ datamodel: prepareDatamodel(source) });
  return dmmfToModel(dmmf, name);
}
