// Module view: tables folded into one node per module, foreign keys between modules folded into one edge per
// direction. It shows schema (FK) coupling only, nothing about calls or events. Pure; no DOM.
import { UNASSIGNED } from "../model/page-data.js";

// Modules each module may depend on: the transitive closure of dependsOn (config validation keeps it acyclic),
// or only the direct entries for a module with transitive: false. The closure of a module still includes the
// further reach of its dependencies, even when one of them is non-transitive itself: transitive is about what
// THAT module may reference, not about what others may reach through it.
function allowedDependencies(modules) {
  const memo = new Map();
  const closure = key => {
    if (memo.has(key)) return memo.get(key);
    const result = new Set();
    memo.set(key, result);
    for (const dep of modules[key].dependsOn || []) {
      if (!modules[dep]) continue;
      result.add(dep);
      if (modules[key].transitive === false) continue;
      for (const further of closure(dep)) result.add(further);
    }
    return result;
  };
  return Object.fromEntries(Object.keys(modules).map(key => [key, closure(key)]));
}

function reachable(start, adjacency) {
  const seen = new Set(), stack = [start];
  while (stack.length) for (const next of adjacency.get(stack.pop()) || []) if (!seen.has(next)) { seen.add(next); stack.push(next); }
  return seen;
}

/**
 * Layer rule, only when at least one module declares dependsOn (otherwise nothing is judged):
 * - "cycle": the edge lies on a cycle between modules (the target module reaches the source again);
 * - "not-allowed": the source declares dependsOn and the target is not in its closure (transitive: false: not a direct entry);
 * - null otherwise. Tables without a module have no rule; their edges are never judged.
 * Only foreign-key edges are judged and take part in cycles; opaque edges never do.
 */
function markViolations(edges, modules) {
  const layered = Object.values(modules).some(spec => spec.dependsOn !== undefined);
  if (!layered) return false;
  const allowed = allowedDependencies(modules);
  const judged = edges.filter(e => e.kind === "fk" && e.from !== UNASSIGNED && e.to !== UNASSIGNED);
  const adjacency = new Map();
  for (const e of judged) adjacency.set(e.from, [...(adjacency.get(e.from) || []), e.to]);
  for (const e of judged) {
    if (reachable(e.to, adjacency).has(e.from)) e.violation = "cycle";
    else if (modules[e.from].dependsOn !== undefined && !allowed[e.from].has(e.to)) e.violation = "not-allowed";
  }
  return true;
}

/**
 * @param model normalized model
 * @param {{ modules: object, moduleOf: (entity) => string | null, tileOf: (relation) => { other: string } | null }} options
 *   modules: config.modules; moduleOf: the module axis resolver; tileOf: the tile rule (relations that are no line)
 * @returns {{
 *   nodes: { key, label, color?, unassigned?: true, entityIds: string[], tableCount, internalRelationCount, hiddenRelationCount }[],
 *   edges: { key, kind: "fk" | "opaque", from, to, relations: string[], violation: null | "cycle" | "not-allowed" }[],
 *   layered: boolean
 * }} nodes in config order with the unassigned tables last (only when there are any). Relations to tile or badge
 *   tables take part in the layer check like any other; they stay hidden (counted on the module of the referencing
 *   table) unless their edge violates, then the edge shows them. Opaque references (no foreign key) get their own
 *   edge kind, are never judged and are not counted as foreign keys inside a module.
 */
export function buildModuleGraph(model, { modules, moduleOf, tileOf }) {
  const keyOf = new Map(model.entities.map(e => {
    const key = moduleOf(e);
    return [e.id, key && modules[key] ? key : UNASSIGNED];
  }));
  const nodes = Object.entries(modules).map(([key, spec]) => ({ key, label: spec.label, ...(spec.color ? { color: spec.color } : {}), entityIds: [], tableCount: 0, internalRelationCount: 0, hiddenRelationCount: 0 }));
  const unassigned = { key: UNASSIGNED, label: "", unassigned: true, entityIds: [], tableCount: 0, internalRelationCount: 0, hiddenRelationCount: 0 };
  const nodeByKey = new Map([...nodes, unassigned].map(n => [n.key, n]));
  for (const e of model.entities) {
    const node = nodeByKey.get(keyOf.get(e.id));
    node.entityIds.push(e.id);
    node.tableCount += 1;
  }
  const edgeByKey = new Map(), hiddenAt = new Map();
  for (const r of model.relations) {
    const tile = tileOf(r);
    const from = keyOf.get(r.from), to = keyOf.get(r.to);
    const kind = r.opaque ? "opaque" : "fk";
    if (from === to) {
      if (tile) nodeByKey.get(keyOf.get(tile.other)).hiddenRelationCount += 1;
      else if (kind === "fk") nodeByKey.get(from).internalRelationCount += 1;
      continue;
    }
    // JSON, not a joined string: module keys are free text and may contain any separator.
    const key = JSON.stringify([from, to, kind]);
    if (!edgeByKey.has(key)) edgeByKey.set(key, { key, kind, from, to, relations: [], violation: null });
    edgeByKey.get(key).relations.push(r.id);
    if (tile) hiddenAt.set(r.id, keyOf.get(tile.other));
  }
  const shown = unassigned.tableCount ? [...nodes, unassigned] : nodes;
  const order = new Map(shown.map((n, i) => [n.key, i]));
  const sorted = [...edgeByKey.values()].sort((a, b) => order.get(a.from) - order.get(b.from) || order.get(a.to) - order.get(b.to) || (a.kind === "fk" ? -1 : 1));
  const layered = markViolations(sorted, modules);
  // Hidden relations (tile/badge) were judged together with the rest; they only appear when their edge violates.
  const edges = [];
  for (const edge of sorted) {
    if (!edge.violation) {
      const visible = edge.relations.filter(id => !hiddenAt.has(id));
      for (const id of edge.relations) if (hiddenAt.has(id)) nodeByKey.get(hiddenAt.get(id)).hiddenRelationCount += 1;
      if (!visible.length) continue;
      edge.relations = visible;
    }
    edges.push(edge);
  }
  return { nodes: shown, edges, layered };
}
