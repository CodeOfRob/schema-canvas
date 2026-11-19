// Module view: tables folded into one node per module, foreign keys between modules folded into one edge per
// direction. It shows schema (FK) coupling only, nothing about calls or events. Pure; no DOM.
import { UNASSIGNED } from "../model/page-data.js";

// Modules each module may depend on, directly or through others (config validation keeps dependsOn acyclic).
function allowedDependencies(modules) {
  const memo = new Map();
  const closure = key => {
    if (memo.has(key)) return memo.get(key);
    const result = new Set();
    memo.set(key, result);
    for (const dep of modules[key].dependsOn || []) {
      if (!modules[dep]) continue;
      result.add(dep);
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
 * - "not-allowed": the source declares dependsOn and the target is not in its transitive closure;
 * - null otherwise. Tables without a module have no rule; their edges are never judged.
 */
function markViolations(edges, modules) {
  const layered = Object.values(modules).some(spec => spec.dependsOn !== undefined);
  if (!layered) return false;
  const allowed = allowedDependencies(modules);
  const judged = edges.filter(e => e.from !== UNASSIGNED && e.to !== UNASSIGNED);
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
 *   edges: { key, from, to, relations: string[], violation: null | "cycle" | "not-allowed" }[],
 *   layered: boolean
 * }} nodes in config order with the unassigned tables last (only when there are any); hidden relations
 *   (tile or badge) count on the module of the referencing table and form no edge
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
  const edgeByKey = new Map();
  for (const r of model.relations) {
    const tile = tileOf(r);
    if (tile) { nodeByKey.get(keyOf.get(tile.other)).hiddenRelationCount += 1; continue; }
    const from = keyOf.get(r.from), to = keyOf.get(r.to);
    if (from === to) { nodeByKey.get(from).internalRelationCount += 1; continue; }
    const key = from + "->" + to;
    if (!edgeByKey.has(key)) edgeByKey.set(key, { key, from, to, relations: [], violation: null });
    edgeByKey.get(key).relations.push(r.id);
  }
  const shown = unassigned.tableCount ? [...nodes, unassigned] : nodes;
  const order = new Map(shown.map((n, i) => [n.key, i]));
  const edges = [...edgeByKey.values()].sort((a, b) => order.get(a.from) - order.get(b.from) || order.get(a.to) - order.get(b.to));
  const layered = markViolations(edges, modules);
  return { nodes: shown, edges, layered };
}
