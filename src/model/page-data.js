// Validation of the two side files next to model.json: config.json and layout.json. Shared by CLI and viewer.

export const LAYOUT_FORMAT_VERSION = 1;
// Reserved data-kind value: an entity explicitly marked as "no kind" (overrides config.entityKinds).
export const NO_KIND = "none";

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
// Colors end up in a generated stylesheet, so only plain color syntax is accepted.
const CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|hsl)a?\([\d\s.,%/]+\))$/;
const isPosition = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

function stringMap(raw, path, issues) {
  if (raw === undefined) return {};
  if (!isPlainObject(raw) || !Object.values(raw).every(v => typeof v === "string")) { issues.push(path + " must map names to strings"); return {}; }
  return { ...raw };
}

export function normalizeConfig(raw = {}, label = "config") {
  const issues = [];
  if (!isPlainObject(raw)) throw new Error(label + " must be a JSON object");
  for (const key of ["title", "storageKey", "dbDocPath"]) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") issues.push(key + " must be a string");
  }
  if (raw.tileTables !== undefined && !(Array.isArray(raw.tileTables) && raw.tileTables.every(t => typeof t === "string"))) issues.push("tileTables must be an array of table names");
  const dataKinds = {};
  if (raw.dataKinds !== undefined) {
    if (!isPlainObject(raw.dataKinds)) issues.push("dataKinds must be an object { kind: { label, color? } }");
    else for (const [kind, spec] of Object.entries(raw.dataKinds)) {
      if (kind === NO_KIND) { issues.push("dataKinds: \"" + NO_KIND + "\" is reserved"); continue; }
      if (!isPlainObject(spec) || typeof spec.label !== "string" || (spec.color !== undefined && !(typeof spec.color === "string" && CSS_COLOR.test(spec.color)))) { issues.push("dataKinds." + kind + " must be { label: string, color?: CSS color like \"#0060a3\" }"); continue; }
      dataKinds[kind] = { label: spec.label, ...(spec.color ? { color: spec.color } : {}) };
    }
  }
  const entityKinds = stringMap(raw.entityKinds, "entityKinds", issues);
  for (const [entity, kind] of Object.entries(entityKinds)) if (!dataKinds[kind] && kind !== NO_KIND) issues.push("entityKinds." + entity + ": unknown data kind \"" + kind + "\"");
  const known = new Set(["$schema", "title", "storageKey", "dbDocPath", "tileTables", "dataKinds", "entityKinds", "notes"]);
  for (const key of Object.keys(raw)) if (!known.has(key)) issues.push("unknown key \"" + key + "\"");
  const config = {
    title: raw.title || "",
    storageKey: raw.storageKey || "",
    dbDocPath: raw.dbDocPath || "schema-canvas/state",
    tileTables: raw.tileTables ? [...raw.tileTables] : [],
    dataKinds,
    entityKinds,
    notes: stringMap(raw.notes, "notes", issues),
  };
  if (issues.length) throw new Error(label + " is not a valid config:\n  - " + issues.join("\n  - "));
  return config;
}

export function emptyLayout() {
  return { version: LAYOUT_FORMAT_VERSION, current: {}, target: {}, groups: [] };
}

export function normalizeLayout(raw, label = "layout") {
  const issues = [];
  if (!isPlainObject(raw)) throw new Error(label + " must be a JSON object");
  if (raw.version !== LAYOUT_FORMAT_VERSION) issues.push("version must be " + LAYOUT_FORMAT_VERSION);
  const positions = key => {
    const value = raw[key] === undefined ? {} : raw[key];
    if (!isPlainObject(value) || !Object.values(value).every(isPosition)) { issues.push(key + " must map entity ids to [x, y]"); return {}; }
    return Object.fromEntries(Object.entries(value).map(([id, [x, y]]) => [id, [x, y]]));
  };
  const groups = raw.groups === undefined ? [] : raw.groups;
  const groupsValid = Array.isArray(groups) && groups.every(g => isPlainObject(g) && typeof g.id === "string" && typeof g.name === "string" && Array.isArray(g.members) && g.members.every(m => typeof m === "string"));
  if (!groupsValid) issues.push("groups must be [{ id, name, members: [entity id] }]");
  const layout = {
    version: LAYOUT_FORMAT_VERSION,
    current: positions("current"),
    target: positions("target"),
    groups: groupsValid ? groups.map(g => ({ id: g.id, name: g.name, members: [...g.members] })) : [],
  };
  if (issues.length) throw new Error(label + " is not a valid layout:\n  - " + issues.join("\n  - "));
  return layout;
}
