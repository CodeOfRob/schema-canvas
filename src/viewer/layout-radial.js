// Star layout: one hub in the middle (the best-scoring of the hubs), its neighbours on a ring
// around it, every further relation step one ring further out, each branch in its own slice of the circle.
// Separate small groups of tables get their own compact snowflakes (balloon trees) and, like the tables without any
// relation, go in rows below the star. Pure function, same input -> same output.
import { positionsAtOrigin } from "./geometry.js";
import { ORIGIN, removeOverlaps, weightedArrangementScore } from "./layout.js";

// ROW_GAP: between the rows (and the items in a row) of separate groups and unrelated tables below the star.
const GAP = 40, SPREAD = 1.6 * Math.PI, ROW_GAP = 80;
// Compact rings: radial clearance between two rings (on top of 0.6 x the tables' half heights) and extra room per table
// along a ring. Tighter rings shorten every line but put more lines under tables. Measured on the 130-table fixture and
// a real model of that size (lines under tables / mean line px, real model; before the compact rings 46 / 2349):
// clearance 260 with a table's mean side as its room along the ring gave 88 / 1331 and rings bent by the overlap
// removal up to 9.9 %; clearance 400 with the side-on room plus 40 px gives 60 / 1777, every ring within 0.1 % of one
// radius, and on 500 tables a third of the overlap-removal work (one centre 59 ms instead of 110 ms).
const RING_GAP = 400, ANGLE_PAD = 40;

function buildGraph(boxes, relations) {
  const box = new Map(boxes.map(b => [b.id, b]));
  const adj = new Map(boxes.map(b => [b.id, new Set()]));
  for (const r of relations) if (adj.has(r.from) && adj.has(r.to) && r.from !== r.to) { adj.get(r.from).add(r.to); adj.get(r.to).add(r.from); }
  return { box, adj, degree: id => adj.get(id).size };
}

function components(ids, adj) {
  const result = [], seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const members = [], queue = [id];
    seen.add(id);
    while (queue.length) { const x = queue.shift(); members.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); queue.push(y); } }
    result.push(members);
  }
  return result.sort((a, b) => b.length - a.length);
}

function distancesFrom(start, adj) {
  const dist = new Map([[start, 0]]), queue = [start];
  while (queue.length) { const x = queue.shift(); for (const y of adj.get(x)) if (!dist.has(y)) { dist.set(y, dist.get(x) + 1); queue.push(y); } }
  return dist;
}

/** Spanning tree from the centre: each table hangs below its best-connected neighbour one step closer to the centre. */
function spanningTree(members, root, dist, { adj, degree }) {
  const kids = new Map(members.map(id => [id, []]));
  for (const id of members) {
    if (id === root) continue;
    const parent = [...adj.get(id)].filter(p => dist.get(p) === dist.get(id) - 1).sort((a, b) => degree(b) - degree(a))[0];
    kids.get(parent).push(id);
  }
  return kids;
}

/** A compact balloon tree for a small group, laid out around (0, 0). */
function snowflake(members, root, graph) {
  const { box } = graph;
  const kids = spanningTree(members, root, distancesFrom(root, graph.adj), graph);
  const rad = id => Math.hypot(box.get(id).w, box.get(id).h) / 4;
  const R = new Map(), dist = new Map(), share = new Map();
  // Bottom-up: the smallest radius at which all child circles fit into the allowed angle; then small children are
  // pulled back towards their parent while the angle still suffices, so satellites hug their table.
  const fit = (v, span) => {
    const ch = kids.get(v);
    if (!ch.length) { R.set(v, rad(v)); return; }
    for (const k of ch) fit(k, SPREAD);
    const base = k => rad(v) + GAP + R.get(k);
    const angle = (k, d) => 2 * Math.asin(Math.min(1, (R.get(k) + GAP / 2) / d));
    const fits = T => ch.every(k => T - R.get(k) >= base(k)) && ch.reduce((s, k) => s + angle(k, T - R.get(k)), 0) <= span;
    let lo = Math.max(...ch.map(k => base(k) + R.get(k))), hi = lo;
    while (!fits(hi)) hi *= 1.3;
    if (!fits(lo)) { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; } lo = hi; }
    for (const k of ch) dist.set(k, lo - R.get(k));
    let total = ch.reduce((s, k) => s + angle(k, dist.get(k)), 0);
    for (const k of [...ch].sort((a, b) => R.get(a) - R.get(b))) {
      let near = base(k), far = dist.get(k);
      const rest = total - angle(k, far);
      if (rest + angle(k, near) <= span) dist.set(k, near);
      else { for (let i = 0; i < 30; i++) { const mid = (near + far) / 2; if (rest + angle(k, mid) <= span) far = mid; else near = mid; } dist.set(k, far); }
      total = rest + angle(k, dist.get(k));
    }
    for (const k of ch) share.set(k, angle(k, dist.get(k)));
    R.set(v, Math.max(rad(v), ...ch.map(k => dist.get(k) + R.get(k))));
  };
  fit(root, 2 * Math.PI);
  // Top-down: children fan out away from the centre, the biggest subtree in the middle of the fan.
  const P = new Map([[root, [0, 0]]]);
  const place = (v, direction, full) => {
    const ch = [...kids.get(v)].sort((a, b) => R.get(b) - R.get(a));
    if (!ch.length) return;
    const fan = [];
    ch.forEach((k, i) => { if (i % 2) fan.push(k); else fan.unshift(k); });
    const used = fan.reduce((s, k) => s + share.get(k), 0);
    const slack = full ? (2 * Math.PI - used) / fan.length : 0;
    let a = direction - (used + slack * fan.length) / 2;
    for (const k of fan) {
      const mid = a + (share.get(k) + slack) / 2;
      P.set(k, [P.get(v)[0] + dist.get(k) * Math.cos(mid), P.get(v)[1] + dist.get(k) * Math.sin(mid)]);
      place(k, mid, false);
      a += share.get(k) + slack;
    }
  };
  place(root, -Math.PI / 2, true);
  return { P, R: R.get(root) };
}

/**
 * Pushes the angles of one ring apart (in place, keeping their order) until every pair of neighbours is at least the
 * mean of their angular widths apart. The ring is sized so the widths fit into the full circle.
 */
function spreadOnRing(ids, angle, width) {
  if (ids.length < 2) return;
  for (let pass = 0; pass < 500; pass++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length];
      const gap = angle.get(b) - angle.get(a) + (i === ids.length - 1 ? 2 * Math.PI : 0);
      const want = (width(a) + width(b)) / 2;
      if (gap < want - 1e-9) { const push = (want - gap) / 2; angle.set(a, angle.get(a) - push); angle.set(b, angle.get(b) + push); moved = true; }
    }
    if (!moved) return;
  }
}

/** The main group as a radial tree: each branch gets a slice proportional to the space its tables need. */
function radialTree(members, root, graph) {
  const { box, adj } = graph;
  const depth = distancesFrom(root, adj);
  const maxDepth = Math.max(...members.map(id => depth.get(id)));
  const kids = spanningTree(members, root, depth, graph);
  const size = id => box.get(id).w / 2 + box.get(id).h / 2 + GAP;
  const need = new Map();
  const calc = v => { need.set(v, Math.max(size(v), kids.get(v).reduce((s, k) => s + calc(k), 0))); return need.get(v); };
  calc(root);
  // Siblings with relations between their branches lie next to each other (fewer long lines).
  const branch = v => { const set = new Set([v]); for (const k of kids.get(v)) for (const x of branch(k)) set.add(x); return set; };
  const linkCount = (a, b) => { const sb = branch(b); let n = 0; for (const x of branch(a)) for (const y of adj.get(x)) if (sb.has(y)) n++; return n; };
  for (const v of members) {
    const ch = kids.get(v);
    if (ch.length < 3) continue;
    const ordered = [ch.sort((a, b) => need.get(b) - need.get(a))[0]], rest = ch.slice(1);
    while (rest.length) {
      const last = ordered[ordered.length - 1];
      rest.sort((a, b) => (linkCount(last, b) - linkCount(last, a)) || (need.get(b) - need.get(a)));
      ordered.push(rest.shift());
    }
    kids.set(v, ordered);
  }
  const mid = new Map();
  const assign = (v, a0, a1) => {
    mid.set(v, (a0 + a1) / 2);
    const total = kids.get(v).reduce((s, k) => s + need.get(k), 0);
    let a = a0;
    for (const k of kids.get(v)) { const span = (a1 - a0) * need.get(k) / total; assign(k, a, a + span); a += span; }
  };
  assign(root, -Math.PI / 2, 1.5 * Math.PI);
  // Compact rings: a ring is only as big as its tables need side by side (and clear of the previous ring); the slices
  // only give each table its angle, in branch order, and the angles are then spread until neighbours fit. Sizing the
  // ring by the narrowest slice instead made the first ring around a hub 3300 px wide on the real model.
  const ring = [0];
  for (let d = 1; d <= maxDepth; d++) {
    const onRing = members.filter(id => depth.get(id) === d).sort((a, b) => mid.get(a) - mid.get(b));
    const prevH = Math.max(...members.filter(id => depth.get(id) === d - 1).map(id => box.get(id).h));
    const thisH = Math.max(...onRing.map(id => box.get(id).h));
    // Room a table takes along the ring: its box seen side-on at its angle (a tall table at the side of the ring needs
    // its height, at the top or bottom its width).
    const along = id => Math.abs(box.get(id).w * Math.sin(mid.get(id))) + Math.abs(box.get(id).h * Math.cos(mid.get(id))) + GAP + ANGLE_PAD;
    const sideBySide = onRing.reduce((sum, id) => sum + along(id), 0) / (2 * Math.PI);
    ring.push(Math.max(sideBySide, ring[d - 1] + (prevH + thisH) / 2 * 0.6 + RING_GAP));
    spreadOnRing(onRing, mid, id => along(id) / ring[d]);
  }
  const P = new Map(members.map(id => [id, depth.get(id) ? [ring[depth.get(id)] * Math.cos(mid.get(id)), ring[depth.get(id)] * Math.sin(mid.get(id))] : [0, 0]]));
  return { P };
}

// Upper bound of the centre candidates (the hubs, see hubCandidates; the most central ones first when there are more).
// One run plus its score costs 2-3.5 ms on 130 tables; the bound keeps a model with very many hubs responsive.
const MAX_CENTRE_CANDIDATES = 120;
// Bigger models: one candidate costs about tables² + lines² checks (overlap removal over table pairs, crossings over line
// pairs). Measured per candidate with compact rings: about 3 ms at 130 tables / 197 lines, 59 ms at 500 / 734. This
// budget allows about 114 candidates at the fixture size and a real model of the same size (about 53 000 per
// candidate), more than their 12-13 hubs, and 8 on 500 tables (about half a second). A size cap, not a clock: the
// same model always tries the same candidates on any machine, so it always gives the same star.
const CENTRE_SEARCH_BUDGET = 6.4e6;
const MIN_CENTRE_CANDIDATES = 5;

// The centre is a hub (GF 20.11.2026): with every table as a candidate the best score went to a table with a single
// relation on the real model, so the middle held one leaf and the hubs sat on the second ring 3000 px out; it did not
// read as a star. The score differences between centres were small (6 % between that leaf and the best hub).
const HUB_SHARE = 0.1;
const MIN_HUB_CANDIDATES = 3;

/**
 * Centre candidates of the biggest group: the HUB_SHARE of its tables with the most relations (at least
 * MIN_HUB_CANDIDATES; every table tying with the last one counts in), ordered by degree, then id.
 */
export function hubCandidates(ids, degreeOf) {
  const sorted = [...ids].sort((a, b) => degreeOf(b) - degreeOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  const count = Math.min(sorted.length, Math.max(MIN_HUB_CANDIDATES, Math.ceil(sorted.length * HUB_SHARE)));
  const cut = degreeOf(sorted[count - 1]);
  return sorted.filter(id => degreeOf(id) >= cut);
}

/** How many centres the star tries for a model of this size (the most central ones first). */
export function centreCandidateCount(tableCount, lineCount) {
  const perCandidate = tableCount * tableCount + lineCount * lineCount;
  return Math.max(MIN_CENTRE_CANDIDATES, Math.min(MAX_CENTRE_CANDIDATES, Math.floor(CENTRE_SEARCH_BUDGET / perCandidate)));
}

/** Smallest mean number of relation steps to all others first (ties: more relations, then id). */
function byCentrality(members, { adj, degree }) {
  const meanSteps = new Map(members.map(id => { const d = [...distancesFrom(id, adj).values()]; return [id, d.reduce((a, b) => a + b, 0) / d.length - degree(id) * 0.01]; }));
  return [...members].sort((a, b) => meanSteps.get(a) - meanSteps.get(b) || (a < b ? -1 : a > b ? 1 : 0));
}

function layoutAround(mainRoot, boxes, graph, groups, rank) {
  const { box } = graph;
  const main = radialTree(groups[0], mainRoot, graph);
  const centres = new Map(main.P);
  // Below the star, in rows as wide as the star: first the separate small groups (biggest first), then the tables
  // without relations (in rank order, tallest first). Left of the star they formed long columns that dominated the
  // picture of a real model. Each small group takes its most central table (ties: smallest id) as centre: measured on
  // the fixture and a real model, they have 2-3 tables and no crossing whichever table is in the middle.
  const items = [];
  for (const members of groups.slice(1).filter(g => g.length > 1)) {
    const g = snowflake(members, byCentrality(members, graph)[0], graph);
    items.push({ w: 2 * g.R, h: 2 * g.R, place: (left, top) => { for (const [id, [px, py]] of g.P) centres.set(id, [left + g.R + px, top + g.R + py]); } });
  }
  const singles = groups.slice(1).filter(g => g.length === 1).map(g => g[0]);
  singles.sort((a, b) => (rank(a) - rank(b)) || box.get(b).h - box.get(a).h);
  for (const id of singles) {
    const b = box.get(id);
    items.push({ w: b.w, h: b.h, place: (left, top) => centres.set(id, [left + b.w / 2, top + b.h / 2]) });
  }
  const edge = (pick, side) => pick(...[...main.P].map(([id, [px, py]]) => side(box.get(id), px, py)));
  const left = edge(Math.min, (b, px) => px - b.w / 2), right = edge(Math.max, (b, px) => px + b.w / 2);
  const rowWidth = Math.max(right - left, ...items.map(item => item.w));
  let x = left, y = edge(Math.max, (b, px, py) => py + b.h / 2) + 2 * ROW_GAP, rowHeight = 0;
  for (const item of items) {
    if (x > left && x + item.w > left + rowWidth) { x = left; y += rowHeight + ROW_GAP; rowHeight = 0; }
    item.place(x, y);
    x += item.w + ROW_GAP;
    rowHeight = Math.max(rowHeight, item.h);
  }
  // Tall tables are only approximated by circles; push apart whatever still overlaps.
  const nodes = boxes.map(b => ({ id: b.id, x: centres.get(b.id)[0], y: centres.get(b.id)[1], w: b.w, h: b.h }));
  removeOverlaps(nodes, 40, 40);
  return positionsAtOrigin(nodes, ORIGIN).pos;
}

/**
 * @param boxes [{id, x, y, w, h}] top-left
 * @param relations [{from, to}] drawn as lines
 * Every hub of the biggest group (hubCandidates) is tried as the centre and the run with the lowest
 * weightedArrangementScore wins (ties: smallest id); the viewer always searches.
 * @param options.centre fixes the centre of the biggest group instead (ignored for a table outside it). The viewer
 *   never passes it; it lets a caller compare one centre against the search (the tests prove the search is never
 *   worse than any other hub as the centre) and look at the rings around a known table.
 * @param options.rank (id) => number, order of the unrelated tables (e.g. the data-kind order)
 * @returns {{ pos: Record<string, [number, number]>, centre: string|null }}
 */
export function arrangeRadial(boxes, relations, { centre = null, rank = () => 0 } = {}) {
  if (!boxes.length) return { pos: {}, centre: null };
  const graph = buildGraph(boxes, relations);
  const groups = components(boxes.map(b => b.id), graph.adj);
  if (centre && groups[0].includes(centre)) return { pos: layoutAround(centre, boxes, graph, groups, rank), centre };
  let best = null;
  const hubs = new Set(hubCandidates(groups[0], graph.degree));
  const candidates = byCentrality(groups[0], graph).filter(id => hubs.has(id)).slice(0, centreCandidateCount(boxes.length, relations.length));
  for (const candidate of candidates) {
    const pos = layoutAround(candidate, boxes, graph, groups, rank);
    const score = weightedArrangementScore(boxes, pos, relations).total;
    // Candidates come in centrality order, not id order: an equal score goes to the smaller id.
    if (!best || score < best.score || (score === best.score && candidate < best.centre)) best = { pos, score, centre: candidate };
  }
  return { pos: best.pos, centre: best.centre };
}
