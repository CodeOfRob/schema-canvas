// tbls adapter: maps the JSON document written by `tbls out -t json` (https://github.com/k1LoW/tbls,
// structs in schema/json.go) onto model.json. tbls does the database introspection; this module only maps.
import { MODEL_FORMAT_VERSION } from "../model/normalize.js";

const CHILD_CARDINALITY = { zero_or_one: "0..1", exactly_one: "1", zero_or_more: "n", one_or_more: "n" };
const PARENT_CARDINALITY = { zero_or_one: "0..1", exactly_one: "1" };

// Views and materialized views carry no keys of their own; only real tables become entities.
function isBaseTable(table) {
  const type = String(table.type || "").toUpperCase();
  return type.includes("TABLE") && !type.includes("VIEW");
}

function indexPredicate(def) {
  const match = /\sWHERE\s+(.+)$/i.exec(def || "");
  if (!match) return undefined;
  const text = match[1].trim();
  return text.startsWith("(") && text.endsWith(")") ? text.slice(1, -1) : text;
}

function mapTable(table, localName, foreignKeyColumns) {
  const constraints = table.constraints || [];
  const pkConstraint = constraints.find(c => c.type === "PRIMARY KEY");
  const pkColumns = new Set(pkConstraint ? pkConstraint.columns || [] : []);
  const uniqueColumns = new Set();
  for (const c of constraints) if (c.type === "UNIQUE" && (c.columns || []).length === 1) uniqueColumns.add(c.columns[0]);
  const indexes = [];
  for (const index of table.indexes || []) {
    if (pkConstraint && index.name === pkConstraint.name) continue;
    const unique = /^\s*CREATE\s+UNIQUE\s+INDEX/i.test(index.def || "");
    const where = indexPredicate(index.def);
    // A plain single-column unique index is shown as the column's UK marker instead.
    if (unique && !where && index.columns.length === 1) { uniqueColumns.add(index.columns[0]); continue; }
    const entry = { entity: localName, name: index.name, fields: [...index.columns], unique };
    if (where) entry.where = where;
    indexes.push(entry);
  }
  const entity = { id: localName, name: localName };
  if (table.comment) entity.note = table.comment;
  entity.fields = table.columns.map(column => {
    const list = /\[\]$/.test(column.type);
    const field = { name: column.name, type: list ? column.type.replace(/(\[\])+$/, "") : column.type, nullable: column.nullable === true };
    if (list) field.list = true;
    if (typeof column.default === "string") field.default = column.default;
    if (pkColumns.has(column.name)) field.pk = true;
    if (uniqueColumns.has(column.name)) field.uk = true;
    if (foreignKeyColumns.has(column.name)) field.fk = true;
    if (column.comment) field.note = column.comment;
    return field;
  });
  return { entity, indexes };
}

/** Maps a parsed tbls JSON document onto model.json. */
export function tblsToModel(doc, name = "") {
  if (!doc || !Array.isArray(doc.tables)) throw new Error("Not a tbls JSON document: missing tables[] (create it with `tbls out -t json`)");
  const currentSchema = doc.driver && doc.driver.meta && doc.driver.meta.current_schema;
  // "public.books" -> "books" for the current schema; other schemas keep their prefix ("audit.events").
  const local = qualified => (currentSchema && qualified.startsWith(currentSchema + ".") ? qualified.slice(currentSchema.length + 1) : qualified);
  const tables = doc.tables.filter(isBaseTable);
  const known = new Set(tables.map(t => t.name));
  const relationsIn = (doc.relations || []).filter(r => known.has(r.table) && known.has(r.parent_table));
  const foreignKeys = new Map(tables.map(t => [t.name, new Set()]));
  for (const r of relationsIn) r.columns.forEach(c => foreignKeys.get(r.table).add(c));
  const mapped = tables.map(t => mapTable(t, local(t.name), foreignKeys.get(t.name)));
  const relations = relationsIn.map(r => ({
    id: local(r.table) + "." + r.columns.join("_") + "->" + local(r.parent_table),
    from: local(r.table),
    to: local(r.parent_table),
    fromFields: [...r.columns],
    toFields: [...r.parent_columns],
    cardinality: { from: CHILD_CARDINALITY[r.cardinality] || "n", to: PARENT_CARDINALITY[r.parent_cardinality] || "1" },
  }));
  return {
    version: MODEL_FORMAT_VERSION,
    name: name || doc.name || "",
    entities: mapped.map(m => m.entity),
    relations,
    indexes: mapped.flatMap(m => m.indexes),
    enums: (doc.enums || []).map(e => ({ name: local(e.name), values: [...e.values] })),
  };
}
