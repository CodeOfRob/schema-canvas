// Star layout: one table in the middle (the selected one, else the most central), its neighbours on a ring
// around it, every further relation step one ring further out, each branch in its own slice of the circle.
// Separate small groups of tables get their own compact snowflakes (balloon trees) on the left; tables without
// any relation are lined up further left. Pure function, same input -> same output.
import { positionsAtOrigin } from "./geometry.js";
import { ORIGIN, removeOverlaps } from "./layout.js";

const GAP = 40, SPREAD = 1.6 * Math.PI, MARGIN = 260;

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
  const slice = new Map(), mid = new Map();
  const assign = (v, a0, a1) => {
    slice.set(v, a1 - a0); mid.set(v, (a0 + a1) / 2);
    const total = kids.get(v).reduce((s, k) => s + need.get(k), 0);
    let a = a0;
    for (const k of kids.get(v)) { const span = (a1 - a0) * need.get(k) / total; assign(k, a, a + span); a += span; }
  };
  assign(root, -Math.PI / 2, 1.5 * Math.PI);
  // Rings: large enough for every table to fit into its slice, and clear of the previous ring.
  const ring = [0];
  for (let d = 1; d <= maxDepth; d++) {
    const onRing = members.filter(id => depth.get(id) === d);
    const fitR = Math.max(...onRing.map(id => size(id) / Math.min(slice.get(id), Math.PI)));
    const prevH = Math.max(...members.filter(id => depth.get(id) === d - 1).map(id => box.get(id).h));
    const thisH = Math.max(...onRing.map(id => box.get(id).h));
    ring.push(Math.max(fitR, ring[d - 1] + (prevH + thisH) / 2 * 0.6 + 260));
  }
  const P = new Map(members.map(id => [id, depth.get(id) ? [ring[depth.get(id)] * Math.cos(mid.get(id)), ring[depth.get(id)] * Math.sin(mid.get(id))] : [0, 0]]));
  return { P, R: ring[maxDepth] + 400 };
}

/**
 * @param boxes [{id, x, y, w, h}] top-left
 * @param relations [{from, to}] drawn as lines
 * @param options.centre id of the table in the middle (ignored when it is not in the biggest group)
 * @param options.rank (id) => number, order of the unrelated tables (e.g. the data-kind order)
 * @returns {{ pos: Record<string, [number, number]>, centre: string|null }}
 */
export function arrangeRadial(boxes, relations, { centre = null, rank = () => 0 } = {}) {
  if (!boxes.length) return { pos: {}, centre: null };
  const graph = buildGraph(boxes, relations);
  const { box, adj, degree } = graph;
  const groups = components(boxes.map(b => b.id), adj);
  // Centre of a group: the requested table, else the smallest mean distance to all others (ties: more relations).
  const centreOf = members => {
    if (centre && members.includes(centre)) return centre;
    let best = members[0], bestScore = Infinity;
    for (const id of members) {
      const d = [...distancesFrom(id, adj).values()], score = d.reduce((a, b) => a + b, 0) / d.length - degree(id) * 0.01;
      if (score < bestScore) { bestScore = score; best = id; }
    }
    return best;
  };
  const mainRoot = centreOf(groups[0]);
  const main = radialTree(groups[0], mainRoot, graph);
  const centres = new Map(main.P);
  let x = -main.R - MARGIN, y = -main.R, columnWidth = 0;
  const smallGroups = groups.slice(1).filter(g => g.length > 1);
  for (const members of smallGroups) {
    const g = snowflake(members, centreOf(members), graph);
    if (y > -main.R && y + 2 * g.R > main.R) { x -= columnWidth + MARGIN; y = -main.R; columnWidth = 0; }
    columnWidth = Math.max(columnWidth, 2 * g.R);
    for (const [id, [px, py]] of g.P) centres.set(id, [x - g.R + px, y + g.R + py]);
    y += 2 * g.R + MARGIN / 2;
  }
  const singles = groups.slice(1).filter(g => g.length === 1).map(g => g[0]);
  if (smallGroups.length) { x -= columnWidth + MARGIN; y = -main.R; columnWidth = 0; }
  singles.sort((a, b) => (rank(a) - rank(b)) || box.get(b).h - box.get(a).h);
  for (const id of singles) {
    const b = box.get(id);
    if (y > -main.R && y + b.h > main.R) { x -= columnWidth + 80; y = -main.R; columnWidth = 0; }
    columnWidth = Math.max(columnWidth, b.w);
    centres.set(id, [x - b.w / 2, y + b.h / 2]);
    y += b.h + 60;
  }
  // Tall tables are only approximated by circles; push apart whatever still overlaps.
  const nodes = boxes.map(b => ({ id: b.id, x: centres.get(b.id)[0], y: centres.get(b.id)[1], w: b.w, h: b.h }));
  removeOverlaps(nodes, 40, 40);
  return { pos: positionsAtOrigin(nodes, ORIGIN).pos, centre: mainRoot };
}
