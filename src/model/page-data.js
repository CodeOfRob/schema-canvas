// Validation of the two side files next to model.json: config.json and layout.json. Shared by CLI and viewer.

const LAYOUT_FORMAT_VERSION = 1;
// Reserved value of every classification axis (data kind, module): an entity explicitly marked as "none"
// (overrides config.entityKinds / config.entityModules); also the filter key of the unassigned tables.
export const UNASSIGNED = "none";
// How the relations of a tile table are shown instead of a line: a name tile above the referencing table,
// or a badge "-> Target" on the foreign-key field.
export const TILE_DISPLAYS = ["tile", "badge"];

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
// Colors end up in a generated stylesheet, so only plain color syntax is accepted.
const CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|hsl)a?\([\d\s.,%/]+\))$/;
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;
const isPosition = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

function stringMap(raw, path, issues) {
  if (raw === undefined) return {};
  if (!isPlainObject(raw) || !Object.values(raw).every(v => typeof v === "string")) { issues.push(path + " must map names to strings"); return {}; }
  return { ...raw };
}

// Shared by the classification axes (data kinds, modules): { key: { label, color?, description?, ...extra } }.
// extra: { name: shape text } for axis-specific keys, normalized by normalizeExtra (null = invalid).
function categories(raw, path, issues, { extra = {}, normalizeExtra = () => ({}) } = {}) {
  const result = {};
  if (raw === undefined) return result;
  const shape = "{ label: string, color?: CSS color like \"#0060a3\", description?: string" + Object.entries(extra).map(([k, text]) => ", " + k + "?: " + text).join("") + " }";
  if (!isPlainObject(raw)) { issues.push(path + " must be an object { key: " + shape + " }"); return result; }
  const allowed = new Set(["label", "color", "description", ...Object.keys(extra)]);
  for (const [key, spec] of Object.entries(raw)) {
    if (key === UNASSIGNED) { issues.push(path + ": \"" + UNASSIGNED + "\" is reserved"); continue; }
    const valid = isPlainObject(spec) && typeof spec.label === "string" && Object.keys(spec).every(k => allowed.has(k)) &&
      (spec.color === undefined || (typeof spec.color === "string" && CSS_COLOR.test(spec.color))) && (spec.description === undefined || typeof spec.description === "string");
    const extraValues = valid ? normalizeExtra(spec) : null;
    if (!extraValues) { issues.push(path + "." + key + " must be " + shape); continue; }
    result[key] = { label: spec.label, ...(spec.color ? { color: spec.color } : {}), ...(spec.description ? { description: spec.description } : {}), ...extraValues };
  }
  return result;
}

// Name -> category key; the key must exist on the axis or be UNASSIGNED.
function assignments(raw, path, known, what, issues) {
  const map = stringMap(raw, path, issues);
  for (const [entity, key] of Object.entries(map)) if (!known[key] && key !== UNASSIGNED) issues.push(path + "." + entity + ": unknown " + what + " \"" + key + "\"");
  return map;
}

function moduleDependencies(spec) {
  if (spec.dependsOn === undefined) return {};
  return Array.isArray(spec.dependsOn) && spec.dependsOn.every(k => typeof k === "string") ? { dependsOn: [...spec.dependsOn] } : null;
}

// dependsOn must name other declared modules and stay acyclic: a cycle would make every layer rule meaningless.
function checkModuleDependencies(modules, issues) {
  for (const [key, spec] of Object.entries(modules)) for (const dep of spec.dependsOn || []) {
    if (dep === key) issues.push("modules." + key + ".dependsOn: a module cannot depend on itself");
    else if (!modules[dep]) issues.push("modules." + key + ".dependsOn: unknown module \"" + dep + "\"");
  }
  const done = new Set(), path = [];
  const visit = key => {
    if (done.has(key)) return null;
    const at = path.indexOf(key);
    if (at >= 0) return [...path.slice(at), key];
    path.push(key);
    for (const dep of modules[key].dependsOn || []) {
      if (!modules[dep] || dep === key) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    path.pop();
    done.add(key);
    return null;
  };
  for (const key of Object.keys(modules)) {
    const cycle = visit(key);
    if (cycle) { issues.push("modules: dependsOn forms a cycle: " + cycle.join(" -> ")); return; }
  }
}

function tileTables(raw, issues) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { issues.push("tileTables must be an array of table names or { name, display: \"tile\" | \"badge\" }"); return []; }
  const result = [], seen = new Set();
  raw.forEach((entry, i) => {
    const spec = typeof entry === "string" ? { name: entry } : entry;
    const valid = isPlainObject(spec) && typeof spec.name === "string" && spec.name !== "" && Object.keys(spec).every(k => k === "name" || k === "display") &&
      (spec.display === undefined || TILE_DISPLAYS.includes(spec.display));
    if (!valid) { issues.push("tileTables[" + i + "] must be a table name or { name, display: " + TILE_DISPLAYS.map(d => "\"" + d + "\"").join(" | ") + " }"); return; }
    if (seen.has(spec.name)) { issues.push("tileTables: \"" + spec.name + "\" is listed twice"); return; }
    seen.add(spec.name);
    result.push({ name: spec.name, display: spec.display || "tile" });
  });
  return result;
}

export function normalizeConfig(raw = {}, label = "config") {
  const issues = [];
  if (!isPlainObject(raw)) throw new Error(label + " must be a JSON object");
  for (const key of ["title", "description", "storageKey", "dbDocPath"]) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") issues.push(key + " must be a string");
  }
  const dataKinds = categories(raw.dataKinds, "dataKinds", issues);
  const modules = categories(raw.modules, "modules", issues, { extra: { dependsOn: "[module key]" }, normalizeExtra: moduleDependencies });
  checkModuleDependencies(modules, issues);
  const sections = raw.sections === undefined ? [] : raw.sections;
  const sectionsValid = Array.isArray(sections) && sections.every(s => isPlainObject(s) && typeof s.title === "string" && typeof s.markdown === "string" && Object.keys(s).every(k => k === "title" || k === "markdown"));
  if (!sectionsValid) issues.push("sections must be [{ title: string, markdown: string }]");
  if (raw.language !== undefined && raw.language !== "" && !(typeof raw.language === "string" && LANGUAGE_TAG.test(raw.language))) issues.push("language must be a language tag like \"en\" or \"de-CH\"");
  const known = new Set(["$schema", "title", "description", "language", "storageKey", "dbDocPath", "tileTables", "dataKinds", "entityKinds", "modules", "entityModules", "notes", "sections", "strings"]);
  for (const key of Object.keys(raw)) if (!known.has(key)) issues.push("unknown key \"" + key + "\"");
  const config = {
    title: raw.title || "",
    description: raw.description || "",
    language: raw.language || "",
    storageKey: raw.storageKey || "",
    dbDocPath: raw.dbDocPath || "schema-canvas/state",
    tileTables: tileTables(raw.tileTables, issues),
    dataKinds,
    entityKinds: assignments(raw.entityKinds, "entityKinds", dataKinds, "data kind", issues),
    modules,
    entityModules: assignments(raw.entityModules, "entityModules", modules, "module", issues),
    notes: stringMap(raw.notes, "notes", issues),
    sections: sectionsValid ? sections.map(s => ({ title: s.title, markdown: s.markdown })) : [],
    // Keys and placeholders are checked against the viewer's texts by checkStringOverrides (src/viewer/strings.js).
    strings: stringMap(raw.strings, "strings", issues),
  };
  if (issues.length) throw new Error(label + " is not a valid config:\n  - " + issues.join("\n  - "));
  return config;
}

export function emptyLayout() {
  return { version: LAYOUT_FORMAT_VERSION, current: {}, target: {}, groups: [], modules: {} };
}

export function normalizeLayout(raw, label = "layout") {
  const issues = [];
  if (!isPlainObject(raw)) throw new Error(label + " must be a JSON object");
  if (raw.version !== LAYOUT_FORMAT_VERSION) issues.push("version must be " + LAYOUT_FORMAT_VERSION);
  const positions = (key, what = "entity ids") => {
    const value = raw[key] === undefined ? {} : raw[key];
    if (!isPlainObject(value) || !Object.values(value).every(isPosition)) { issues.push(key + " must map " + what + " to [x, y]"); return {}; }
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
    // Module box positions of the module view, one map for both tabs (optional: older layouts have none).
    modules: positions("modules", "module keys"),
  };
  if (issues.length) throw new Error(label + " is not a valid layout:\n  - " + issues.join("\n  - "));
  return layout;
}
