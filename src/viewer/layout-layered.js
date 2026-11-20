// Layered module arrangement (Sugiyama style, without dummy nodes for long arrows): every module sits above everything
// it depends on, as high as possible (modules nothing depends on at the top), the foundation at the bottom; barycenter
// sweeps order each layer to cut crossings.
// Input is the declared dependsOn plus, for modules without it, their foreign-key edges. Opaque edges never count.
// Pure function, same input -> same output.
import { segmentsCross } from "./geometry.js";

// Barycenter ordering settles within a few passes on graphs of a few dozen modules; the best pass is kept.
const SWEEPS = 4;
// The canvas is landscape. A layer wider than a balanced grid of ALL modules would be on such a canvas turns the drawing
// into a wide strip that "Show all" shrinks to unreadable boxes, so such a layer wraps into sub-rows (see rowCapacity).
const CANVAS_ASPECT = 16 / 10;

/** Columns of a grid that fits `count` boxes of this pitch into a CANVAS_ASPECT rectangle (at least two). */
function rowCapacity(count, pitchX, pitchY) {
  return Math.max(2, Math.ceil(Math.sqrt(CANVAS_ASPECT * count * pitchY / pitchX)));
}

/**
 * Dependency edges (from depends on to) between the given modules, kept acyclic: declared dependsOn first (config order),
 * then the foreign-key fallback of modules without dependsOn, sorted by config order; an edge that would close a cycle
 * is dropped, so on a conflict the declared direction and the module earlier in the config win.
 */
function dependencyGraph(nodes, edges, rank) {
  const shown = key => rank.has(key);
  const declaredEdges = nodes.flatMap(n => (n.dependsOn || []).filter(shown).map(dep => [n.key, dep]));
  const undeclared = new Set(nodes.filter(n => n.dependsOn === undefined).map(n => n.key));
  const fallback = edges.filter(e => e.kind === "fk" && undeclared.has(e.from) && shown(e.to)).map(e => [e.from, e.to])
    .sort((a, b) => rank.get(a[0]) - rank.get(b[0]) || rank.get(a[1]) - rank.get(b[1]));
  const down = new Map(nodes.map(n => [n.key, new Set()]));
  const reaches = (start, goal) => {
    const seen = new Set([start]), stack = [start];
    while (stack.length) for (const next of down.get(stack.pop())) {
      if (next === goal) return true;
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    return start === goal;
  };
  for (const [from, to] of [...declaredEdges, ...fallback]) if (!reaches(to, from)) down.get(from).add(to);
  return down;
}

/**
 * Layer per module, 0 = bottom. As late as possible: a module sits directly below its highest dependent, and a module
 * nothing depends on goes to the top layer, so a module with slack (short path down, no dependents) is shown with the
 * other top-level modules instead of half-way down. rank = longest path UP to a module nobody depends on; layer =
 * maxRank - rank. An explicit dependsOn: [] stays on layer 0 (declared foundation); that never breaks "above every
 * dependency", because a dependent always has a smaller rank than the deepest one.
 */
function asLateAsPossibleLayers(nodes, down) {
  const up = new Map(nodes.map(n => [n.key, []]));
  for (const [from, deps] of down) for (const dep of deps) up.get(dep).push(from);
  const rank = new Map();
  const rankOf = key => {
    if (!rank.has(key)) rank.set(key, Math.max(0, ...up.get(key).map(dependent => rankOf(dependent) + 1)));
    return rank.get(key);
  };
  const maxRank = Math.max(0, ...nodes.map(n => rankOf(n.key)));
  return nodes.map(n => (n.dependsOn && n.dependsOn.length === 0 ? 0 : maxRank - rankOf(n.key)));
}

/** Arrows between the (centred) slots of their modules, one layer = one unit of height, that cross each other. */
function countCrossings(pairs, slot, layerOf) {
  const point = key => [slot.get(key), layerOf.get(key)];
  let count = 0;
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
    const [a, b] = pairs[i], [c, d] = pairs[j];
    if (a !== c && a !== d && b !== c && b !== d && segmentsCross(point(a), point(b), point(c), point(d))) count++;
  }
  return count;
}

/** Order inside each layer: barycenter sweeps up and down; ties by config order; the pass with the fewest crossings wins. */
function orderLayers(layers, down, rank) {
  const up = new Map([...down.keys()].map(key => [key, new Set()]));
  for (const [from, deps] of down) for (const dep of deps) up.get(dep).add(from);
  const pairs = [...down].flatMap(([from, deps]) => [...deps].map(dep => [from, dep]));
  const layerOf = new Map(layers.flatMap((members, i) => members.map(key => [key, i])));
  const slot = new Map();
  const setSlots = members => members.forEach((key, i) => slot.set(key, i - (members.length - 1) / 2));
  layers.forEach(setSlots);
  const reorder = (members, neighbours) => {
    const centre = new Map(members.map(key => {
      const around = [...neighbours.get(key)];
      return [key, around.length ? around.reduce((sum, k) => sum + slot.get(k), 0) / around.length : slot.get(key)];
    }));
    members.sort((a, b) => centre.get(a) - centre.get(b) || rank.get(a) - rank.get(b));
    setSlots(members);
  };
  let best = { layers: layers.map(members => [...members]), crossings: countCrossings(pairs, slot, layerOf) };
  for (let sweep = 0; sweep < SWEEPS && best.crossings > 0; sweep++) {
    for (let i = 1; i < layers.length; i++) reorder(layers[i], down);
    for (let i = layers.length - 2; i >= 0; i--) reorder(layers[i], up);
    const crossings = countCrossings(pairs, slot, layerOf);
    if (crossings < best.crossings) best = { layers: layers.map(members => [...members]), crossings };
  }
  return best.layers;
}

/**
 * @param nodes [{ key, dependsOn?: string[], unassigned?: true }] in config order (module-graph.js node shape).
 *   dependsOn undefined: the module falls back to its foreign-key edges; [] is an explicit foundation.
 *   unassigned ("(no module)") belongs to no layer: it sits right of the layers, vertically centred, so a model with or
 *   without unassigned tables keeps the same arrangement for everything else.
 * @param edges [{ from, to, kind: "fk" | "opaque" }] module edges; only "fk" ones of modules without dependsOn count
 * @param box {w, h} size of a module box
 * @returns {key: [x, y]} top-left positions, the drawing's top-left corner at (0, 0)
 */
export function arrangeLayered(nodes, edges, box, { gapX = 120, gapY = 110 } = {}) {
  if (!nodes.length) return {};
  const layered = nodes.filter(n => !n.unassigned), outside = nodes.filter(n => n.unassigned);
  const rank = new Map(layered.map((n, i) => [n.key, i]));
  const down = dependencyGraph(layered, edges, rank);
  const depths = asLateAsPossibleLayers(layered, down);
  const layers = Array.from({ length: layered.length ? Math.max(...depths) + 1 : 0 }, () => []);
  layered.forEach((n, i) => layers[depths[i]].push(n.key));
  const ordered = orderLayers(layers, down, rank);
  const pitchX = box.w + gapX, pitchY = box.h + gapY, capacity = rowCapacity(layered.length, pitchX, pitchY);
  const pos = {};
  let row = 0;
  // Top layer first. A wrapped layer is staggered: member j goes to sub-row j % rows at slot j / rows, so the
  // left-to-right order survives and an arrow to a lower sub-row passes through the gap of the upper one.
  for (let i = ordered.length - 1; i >= 0; i--) {
    const members = ordered[i], rows = Math.ceil(members.length / capacity);
    members.forEach((key, j) => { pos[key] = [(j - (members.length - 1) / 2) / rows * pitchX, (row + j % rows) * pitchY]; });
    row += rows;
  }
  const placed = Object.values(pos);
  const right = placed.length ? Math.max(...placed.map(p => p[0])) + box.w + gapX : 0;
  const stackHeight = row ? row * pitchY - gapY : box.h;
  const outsideHeight = outside.length * pitchY - gapY;
  outside.forEach((n, i) => { pos[n.key] = [right, (stackHeight - outsideHeight) / 2 + i * pitchY]; });
  const all = Object.values(pos), minX = Math.min(...all.map(p => p[0])), minY = Math.min(...all.map(p => p[1]));
  return Object.fromEntries(Object.entries(pos).map(([key, [x, y]]) => [key, [Math.round(x - minX), Math.round(y - minY)]]));
}
