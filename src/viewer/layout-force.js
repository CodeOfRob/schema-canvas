// Force layout ("Forces"), the principle of d3-force: relations are springs, every table repels every other one,
// tables are rectangles that must not overlap, a weak gravity keeps loose tables near the middle and tables of one
// module pull towards their module's centre, so modules form visible islands. Velocity Verlet with cooling (alpha).
// One step is forceTick(simulation): the static run calls it until the simulation has cooled down, the animated run
// calls it once per frame; both end in the same state by construction. Pure and deterministic (seeded jitter).
import { centredNodes, positionsAtOrigin } from "./geometry.js";
import { ORIGIN, removeOverlaps, seededRandom } from "./layout.js";

// Every number below was tuned on the invented 130-table fixture (test/large-model.js, three seeds) and checked on a
// real model of the same size, scoring line crossings + lines under tables (scoreArrangement), how many tables sit
// nearest to their own module's centre, and the drawing's area.
//
// Cooling, as in d3-force: alpha starts at 1 and decays geometrically to ALPHA_MIN in TICKS steps. Every force is
// scaled by alpha, so the layout moves a lot first and then settles. 300 steps (d3's default): 200 left 10-15 % more
// crossings, 500 changed less than the run-to-run spread.
const TICKS = 300;
const ALPHA_MIN = 0.001;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / TICKS);
// Share of the velocity lost per step (friction). d3 uses 0.4; 0.3 lets clusters slide past each other a little
// longer and left about 8 % fewer crossings, without oscillating.
const VELOCITY_DECAY = 0.3;
// Free space between two related tables at rest, in px (on top of their sizes): room for the line and its label.
// 200 scored about 10 % worse; 80 was within the run-to-run spread.
const LINK_GAP = 120;
// Spring strength per relation kind, before d3's per-pair scaling 1 / min(relations of either table). A foreign key
// is a hard coupling; an opaque reference (by id, no foreign key) a softer one that may stretch: at full strength the
// few opaque references pulled tables out of their modules (on the real model crossings rose about 15 %).
const FK_STRENGTH = 1;
const OPAQUE_STRENGTH = 0.3;
// Repulsion (d3 "many-body" charge, force ~ REPULSION / distance). d3 uses -30 for links of 30 px; a force layout is
// scale-free when the charge grows with the square of the link length, so for tables (link ~ 300 px) about -3000.
// Stronger charge trades crossings for area: -4000 had 10-15 % fewer crossings but a 10-25 % larger drawing.
const REPULSION = -3500;
// Rectangle collision: overlap (plus COLLISION_PAD) removed per step, below 1 so stacked tables slide apart instead
// of bouncing. It only acts once alpha drops below COLLISION_FROM_ALPHA (the last ~200 steps): before that tables may
// pass through each other while the layout untangles, which cut crossings + lines under tables by about 20 %.
// The padding equals the final gap, so the closing overlap removal rarely moves anything.
const COLLISION_STRENGTH = 0.7;
const COLLISION_FROM_ALPHA = 0.1;
const COLLISION_PAD = 50;
// Pull towards the middle (d3 forceX/forceY strength). Weak, so it does not squeeze the module islands together.
// A table without any relation and without a module has nothing else holding it: with the plain gravity the
// repulsion of all others pushes it to the rim (measured 1.05x the distance of the farthest related table);
// ORPHAN_GRAVITY times as strong keeps it inside the drawing (0.5-0.7x) instead of in a remote corner.
const GRAVITY = 0.03;
const ORPHAN_GRAVITY = 3;
// Pull towards the centre of the own module (cluster force). Stronger than gravity, weaker than a spring: modules
// form islands, yet a table with foreign keys into another module may sit at its island's edge facing it.
// 0.08 grouped slightly more tables with their module but added crossings; 0.04 loosened the islands.
const CLUSTER = 0.06;
// Start positions that coincide (e.g. new tables in one spot) are spread by up to this many px, seeded.
const JITTER = 30;
// Final gap between table edges, as COLLISION_PAD.
const GAP = COLLISION_PAD;

const radiusOf = node => Math.sqrt(node.w * node.h) / 2;

function springsFrom(nodes, relations, extra) {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  // One spring per pair of tables; a foreign key wins over an opaque reference between the same two tables.
  const pairs = new Map();
  const add = (from, to, strength) => {
    const a = index.get(from), b = index.get(to);
    if (a == null || b == null || a === b) return;
    const key = Math.min(a, b) + "-" + Math.max(a, b);
    if (!pairs.has(key) || pairs.get(key).strength < strength) pairs.set(key, { a: Math.min(a, b), b: Math.max(a, b), strength });
  };
  for (const r of relations) add(r.from, r.to, r.opaque ? OPAQUE_STRENGTH : FK_STRENGTH);
  for (const [from, to, weight] of extra) add(from, to, FK_STRENGTH * weight);
  const springs = [...pairs.values()];
  const degree = new Array(nodes.length).fill(0);
  for (const s of springs) { degree[s.a] += 1; degree[s.b] += 1; }
  // d3: a table with many relations would be pulled from all sides; scaling by the smaller degree keeps hubs stable,
  // and the bias moves the table with fewer relations more.
  return springs.map(s => ({
    ...s,
    strength: s.strength / Math.min(degree[s.a], degree[s.b]),
    bias: degree[s.a] / (degree[s.a] + degree[s.b]),
    length: radiusOf(nodes[s.a]) + radiusOf(nodes[s.b]) + LINK_GAP,
  }));
}

/**
 * @param boxes [{id, x, y, w, h}] top-left, the current arrangement (the start)
 * @param relations [{from, to, opaque?}] the relations that pull (pass hidden opaque ones too: hiding is drawing only)
 * @param options.moduleOf (id) => module key | null; tables without a module get no cluster force
 * @param options.extra [[idA, idB, weight]] pull without a line (e.g. members of one group), weight as a foreign key
 * @returns the simulation state for forceTick
 */
export function createForceSimulation(boxes, relations, { moduleOf = () => null, extra = [], seed = 7919 } = {}) {
  const random = seededRandom(seed);
  const nodes = centredNodes(boxes).map(n => ({ ...n, vx: 0, vy: 0 }));
  const taken = new Set();
  for (const n of nodes) {
    const key = n.x + "," + n.y;
    if (taken.has(key)) { n.x += (random() - 0.5) * 2 * JITTER; n.y += (random() - 0.5) * 2 * JITTER; }
    taken.add(key);
  }
  const moduleIndex = new Map();
  const module = nodes.map(n => {
    const key = moduleOf(n.id);
    if (key == null) return -1;
    if (!moduleIndex.has(key)) moduleIndex.set(key, moduleIndex.size);
    return moduleIndex.get(key);
  });
  const centre = nodes.length ? [nodes.reduce((s, n) => s + n.x, 0) / nodes.length, nodes.reduce((s, n) => s + n.y, 0) / nodes.length] : [0, 0];
  const springs = springsFrom(nodes, relations, extra);
  const linked = new Set(springs.flatMap(s => [s.a, s.b]));
  const gravity = nodes.map((n, i) => (linked.has(i) || module[i] >= 0 ? GRAVITY : GRAVITY * ORPHAN_GRAVITY));
  return { nodes, springs, module, moduleCount: moduleIndex.size, gravity, centre, alpha: 1 };
}

function applySprings({ nodes, springs }, alpha) {
  for (const { a, b, strength, bias, length } of springs) {
    const A = nodes[a], B = nodes[b];
    const dx = B.x + B.vx - A.x - A.vx || 1e-6, dy = B.y + B.vy - A.y - A.vy || 1e-6;
    const distance = Math.hypot(dx, dy);
    const k = (distance - length) / distance * alpha * strength;
    B.vx -= dx * k * bias; B.vy -= dy * k * bias;
    A.vx += dx * k * (1 - bias); A.vy += dy * k * (1 - bias);
  }
}

function applyRepulsion({ nodes }, alpha) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const A = nodes[i], B = nodes[j];
    // Exactly equal centres: a fixed direction by index keeps the run deterministic (d3 jiggles randomly here).
    const dx = B.x - A.x || 1e-3, dy = B.y - A.y;
    const k = REPULSION * alpha / Math.max(dx * dx + dy * dy, 1);
    A.vx += dx * k; A.vy += dy * k;
    B.vx -= dx * k; B.vy -= dy * k;
  }
}

function applyCollision({ nodes }) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const A = nodes[i], B = nodes[j];
    const dx = B.x + B.vx - A.x - A.vx, dy = B.y + B.vy - A.y - A.vy;
    const ox = (A.w + B.w) / 2 + COLLISION_PAD - Math.abs(dx), oy = (A.h + B.h) / 2 + COLLISION_PAD - Math.abs(dy);
    if (ox <= 0 || oy <= 0) continue;
    // Push along the axis that needs the shorter move, half each.
    if (ox < oy) { const s = (dx < 0 || (dx === 0 && i > j) ? -1 : 1) * ox / 2 * COLLISION_STRENGTH; A.vx -= s; B.vx += s; }
    else { const s = (dy < 0 || (dy === 0 && i > j) ? -1 : 1) * oy / 2 * COLLISION_STRENGTH; A.vy -= s; B.vy += s; }
  }
}

function applyCentring({ nodes, module, moduleCount, gravity, centre }, alpha) {
  const sums = Array.from({ length: moduleCount }, () => [0, 0, 0]);
  nodes.forEach((n, i) => { if (module[i] >= 0) { const s = sums[module[i]]; s[0] += n.x; s[1] += n.y; s[2] += 1; } });
  nodes.forEach((n, i) => {
    n.vx += (centre[0] - n.x) * gravity[i] * alpha; n.vy += (centre[1] - n.y) * gravity[i] * alpha;
    if (module[i] < 0) return;
    const [sx, sy, count] = sums[module[i]];
    n.vx += (sx / count - n.x) * CLUSTER * alpha; n.vy += (sy / count - n.y) * CLUSTER * alpha;
  });
}

/** One simulation step; returns false once the layout has cooled down (further steps would change nothing). */
export function forceTick(simulation) {
  if (simulation.alpha < ALPHA_MIN) return false;
  const alpha = simulation.alpha;
  applySprings(simulation, alpha);
  applyRepulsion(simulation, alpha);
  applyCentring(simulation, alpha);
  if (alpha < COLLISION_FROM_ALPHA) applyCollision(simulation);
  for (const n of simulation.nodes) {
    n.vx *= 1 - VELOCITY_DECAY; n.vy *= 1 - VELOCITY_DECAY;
    n.x += n.vx; n.y += n.vy;
  }
  simulation.alpha += (0 - alpha) * ALPHA_DECAY;
  return simulation.alpha >= ALPHA_MIN;
}

/**
 * The finished layout of a simulation: overlaps removed on a copy, moved to the origin.
 * @returns {{ pos: Record<string, [number, number]>, shift: [number, number] }} shift: for framePositions
 */
export function settledPositions(simulation) {
  const nodes = simulation.nodes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  removeOverlaps(nodes, GAP, GAP);
  return positionsAtOrigin(nodes, ORIGIN);
}

/** Top-left positions of the simulation's current state, in the frame of the finished layout (shift from it). */
export function framePositions(simulation, [shiftX, shiftY]) {
  const pos = {};
  for (const n of simulation.nodes) pos[n.id] = [Math.round(n.x - n.w / 2 + shiftX), Math.round(n.y - n.h / 2 + shiftY)];
  return pos;
}

/** The static run: every step at once. Same arguments as createForceSimulation; same input -> same output. */
export function arrangeForces(boxes, relations, options) {
  if (!boxes.length) return { pos: {}, shift: [0, 0] };
  const simulation = createForceSimulation(boxes, relations, options);
  while (forceTick(simulation));
  return settledPositions(simulation);
}
