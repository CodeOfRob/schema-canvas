// Validates a model.json document and returns it in normalized form (ids and booleans filled in).
// This is the one runtime validator shared by the CLI and the viewer; schema/model.schema.json
// describes the same shape for editors and is kept in sync by test/model-schema.test.js.

export const MODEL_FORMAT_VERSION = 1;
export const CARDINALITIES = ["1", "0..1", "n"];

export class ModelError extends Error {
  constructor(label, issues) {
    super(label + " is not a valid model:\n  - " + issues.join("\n  - "));
    this.name = "ModelError";
    this.issues = issues;
  }
}

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = value => typeof value === "string" && value.length > 0;
const isStringArray = value => Array.isArray(value) && value.every(item => typeof item === "string");

// Field references in origin[] are "Entity.field". Entity names may contain dots (e.g. "audit.events"),
// field names never do, so the last dot separates them.
export function fieldRef(entityName, fieldName) {
  return entityName + "." + fieldName;
}
// Index entries are field names; anything that is not a plain name (lower(email), (data->>'key')) is an
// expression, shown as written and not checked against the fields.
const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function isIndexExpression(entry) {
  return !PLAIN_NAME.test(entry);
}
export function splitFieldRef(ref) {
  const cut = ref.lastIndexOf(".");
  return cut < 0 ? { entity: ref, field: "" } : { entity: ref.slice(0, cut), field: ref.slice(cut + 1) };
}

function normalizeField(raw, entity, path, issues) {
  if (!isPlainObject(raw)) { issues.push(path + " must be an object"); return null; }
  if (!isNonEmptyString(raw.name)) issues.push(path + ".name must be a non-empty string");
  if (!isNonEmptyString(raw.type)) issues.push(path + ".type must be a non-empty string");
  for (const flag of ["list", "nullable", "pk", "uk", "fk", "changed"]) {
    if (raw[flag] !== undefined && typeof raw[flag] !== "boolean") issues.push(path + "." + flag + " must be a boolean");
  }
  for (const text of ["default", "note"]) {
    if (raw[text] !== undefined && typeof raw[text] !== "string") issues.push(path + "." + text + " must be a string");
  }
  if (raw.origin !== undefined && !isStringArray(raw.origin)) issues.push(path + ".origin must be an array of \"Entity.field\" strings");
  const field = {
    id: isNonEmptyString(raw.id) ? raw.id : fieldRef(entity.id, raw.name),
    name: raw.name,
    type: raw.type,
    list: raw.list === true,
    nullable: raw.nullable === true,
    pk: raw.pk === true,
    uk: raw.uk === true,
    fk: raw.fk === true,
  };
  if (raw.default !== undefined) field.default = raw.default;
  if (raw.note) field.note = raw.note;
  if (raw.origin) field.origin = [...raw.origin];
  if (raw.changed === true) field.changed = true;
  return field;
}

function normalizeEntity(raw, path, issues) {
  if (!isPlainObject(raw)) { issues.push(path + " must be an object"); return null; }
  if (!isNonEmptyString(raw.name)) issues.push(path + ".name must be a non-empty string");
  if (!Array.isArray(raw.fields)) { issues.push(path + ".fields must be an array"); return null; }
  for (const text of ["kind", "module", "note"]) {
    if (raw[text] !== undefined && typeof raw[text] !== "string") issues.push(path + "." + text + " must be a string");
  }
  if (raw.origin !== undefined && !isStringArray(raw.origin)) issues.push(path + ".origin must be an array of entity names");
  if (raw.reviewed !== undefined && typeof raw.reviewed !== "boolean") issues.push(path + ".reviewed must be a boolean");
  const entity = { id: isNonEmptyString(raw.id) ? raw.id : raw.name, name: raw.name };
  if (raw.kind) entity.kind = raw.kind;
  if (raw.module) entity.module = raw.module;
  if (raw.note) entity.note = raw.note;
  if (raw.origin) entity.origin = [...raw.origin];
  if (raw.reviewed === true) entity.reviewed = true;
  entity.fields = raw.fields.map((f, i) => normalizeField(f, entity, path + ".fields[" + i + "]", issues)).filter(Boolean);
  return entity;
}

function normalizeRelation(raw, path, issues) {
  if (!isPlainObject(raw)) { issues.push(path + " must be an object"); return null; }
  if (!isNonEmptyString(raw.from)) issues.push(path + ".from must be an entity id");
  if (!isNonEmptyString(raw.to)) issues.push(path + ".to must be an entity id");
  for (const list of ["fromFields", "toFields"]) {
    if (raw[list] !== undefined && !isStringArray(raw[list])) issues.push(path + "." + list + " must be an array of field names");
  }
  const card = isPlainObject(raw.cardinality) ? raw.cardinality : {};
  for (const end of ["from", "to"]) {
    if (card[end] !== undefined && !CARDINALITIES.includes(card[end])) issues.push(path + ".cardinality." + end + " must be one of " + CARDINALITIES.join(", "));
  }
  if (raw.label !== undefined && typeof raw.label !== "string") issues.push(path + ".label must be a string");
  const fromFields = Array.isArray(raw.fromFields) ? [...raw.fromFields] : [];
  const relation = {
    id: isNonEmptyString(raw.id) ? raw.id : raw.from + "." + (fromFields.join("_") || "ref") + "->" + raw.to,
    from: raw.from,
    to: raw.to,
    fromFields,
    toFields: Array.isArray(raw.toFields) ? [...raw.toFields] : [],
    cardinality: { from: card.from || "n", to: card.to || "1" },
  };
  if (raw.label) relation.label = raw.label;
  return relation;
}

function normalizeIndex(raw, path, issues) {
  if (!isPlainObject(raw)) { issues.push(path + " must be an object"); return null; }
  if (!isNonEmptyString(raw.entity)) issues.push(path + ".entity must be an entity id");
  if (!isStringArray(raw.fields) || !raw.fields.length) issues.push(path + ".fields must be a non-empty array of field names");
  if (raw.unique !== undefined && typeof raw.unique !== "boolean") issues.push(path + ".unique must be a boolean");
  for (const text of ["name", "where", "note"]) {
    if (raw[text] !== undefined && typeof raw[text] !== "string") issues.push(path + "." + text + " must be a string");
  }
  const index = { entity: raw.entity, fields: isStringArray(raw.fields) ? [...raw.fields] : [], unique: raw.unique === true };
  if (raw.name) index.name = raw.name;
  if (raw.where) index.where = raw.where;
  if (raw.note) index.note = raw.note;
  return index;
}

function normalizeEnum(raw, path, issues) {
  if (!isPlainObject(raw) || !isNonEmptyString(raw.name) || !isStringArray(raw.values)) {
    issues.push(path + " must be { name: string, values: string[] }");
    return null;
  }
  return { name: raw.name, values: [...raw.values] };
}

function reportDuplicates(values, what, issues) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) issues.push("duplicate " + what + " \"" + value + "\"");
    seen.add(value);
  }
}

function checkReferences(model, issues) {
  const byId = new Map(model.entities.map(e => [e.id, e]));
  const hasField = (entity, name) => entity.fields.some(f => f.name === name);
  model.relations.forEach((r, i) => {
    const from = byId.get(r.from), to = byId.get(r.to);
    if (!from) issues.push("relations[" + i + "].from \"" + r.from + "\" is not an entity id");
    if (!to) issues.push("relations[" + i + "].to \"" + r.to + "\" is not an entity id");
    if (from) for (const name of r.fromFields) if (!hasField(from, name)) issues.push("relations[" + i + "].fromFields: \"" + name + "\" is not a field of " + from.name);
    if (to) for (const name of r.toFields) if (!hasField(to, name)) issues.push("relations[" + i + "].toFields: \"" + name + "\" is not a field of " + to.name);
  });
  model.indexes.forEach((index, i) => {
    const entity = byId.get(index.entity);
    if (!entity) { issues.push("indexes[" + i + "].entity \"" + index.entity + "\" is not an entity id"); return; }
    for (const name of index.fields) if (!isIndexExpression(name) && !hasField(entity, name)) issues.push("indexes[" + i + "].fields: \"" + name + "\" is not a field of " + entity.name);
  });
}

/**
 * @param {unknown} raw parsed model.json
 * @param {string} [label] used in the error message (e.g. the file name)
 * @returns normalized model; throws ModelError listing every problem found
 */
export function normalizeModel(raw, label = "model") {
  const issues = [];
  if (!isPlainObject(raw)) throw new ModelError(label, ["the document must be a JSON object"]);
  if (raw.version !== MODEL_FORMAT_VERSION) issues.push("version must be " + MODEL_FORMAT_VERSION);
  if (raw.name !== undefined && typeof raw.name !== "string") issues.push("name must be a string");
  if (!Array.isArray(raw.entities)) throw new ModelError(label, [...issues, "entities must be an array"]);
  for (const list of ["relations", "indexes", "enums"]) {
    if (raw[list] !== undefined && !Array.isArray(raw[list])) issues.push(list + " must be an array");
  }
  const listOf = key => (Array.isArray(raw[key]) ? raw[key] : []);
  const model = {
    version: MODEL_FORMAT_VERSION,
    name: typeof raw.name === "string" ? raw.name : "",
    entities: raw.entities.map((e, i) => normalizeEntity(e, "entities[" + i + "]", issues)).filter(Boolean),
    relations: listOf("relations").map((r, i) => normalizeRelation(r, "relations[" + i + "]", issues)).filter(Boolean),
    indexes: listOf("indexes").map((x, i) => normalizeIndex(x, "indexes[" + i + "]", issues)).filter(Boolean),
    enums: listOf("enums").map((x, i) => normalizeEnum(x, "enums[" + i + "]", issues)).filter(Boolean),
  };
  reportDuplicates(model.entities.map(e => e.id), "entity id", issues);
  reportDuplicates(model.entities.map(e => e.name), "entity name", issues);
  reportDuplicates(model.entities.flatMap(e => e.fields.map(f => f.id)), "field id", issues);
  for (const e of model.entities) reportDuplicates(e.fields.map(f => fieldRef(e.name, f.name)), "field", issues);
  reportDuplicates(model.relations.map(r => r.id), "relation id", issues);
  if (!issues.length) checkReferences(model, issues);
  if (issues.length) throw new ModelError(label, issues);
  return model;
}

/** Compact file form of a normalized model: drops false flags so exported files stay readable. */
export function toDocument(model) {
  const compactField = f => Object.fromEntries(Object.entries(f).filter(([key, value]) => key === "nullable" || value !== false));
  return {
    version: MODEL_FORMAT_VERSION,
    name: model.name,
    entities: model.entities.map(e => ({ ...e, fields: e.fields.map(compactField) })),
    relations: model.relations,
    indexes: model.indexes,
    enums: model.enums,
  };
}
