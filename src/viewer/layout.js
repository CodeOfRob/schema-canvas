// Automatic arrangements. Pure functions: boxes in ({id, x, y, w, h}, top-left), positions out ({id: [x, y]}).

const ORIGIN_X = 60, ORIGIN_Y = 80;
const OVERLAP_EPSILON = 1e-6;

/** Rough box height when the DOM has not measured a table yet. */
export function estimateHeight(fieldCount, indexCount) {
  return 34 + fieldCount * 24 + 22 + (indexCount ? indexCount * 20 + 6 : 0);
}

/**
 * One zone per data kind, left to right in kindOrder (unclassified last), masonry columns inside a zone.
 * The order inside a zone follows the previous position (top-to-bottom, then left-to-right).
 */
export function arrangeByKind(boxes, kindOrder, kindOf, { columnWidth = 290, zoneGap = 140, rowGap = 40 } = {}) {
  const zones = new Map([...kindOrder, null].map(kind => [kind, []]));
  for (const box of boxes) {
    const kind = kindOf(box.id);
    zones.get(zones.has(kind) ? kind : null).push(box);
  }
  const pos = {};
  let x0 = ORIGIN_X;
  for (const members of zones.values()) {
    if (!members.length) continue;
    members.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const columns = Math.min(members.length, Math.max(2, Math.ceil(Math.sqrt(members.length))));
    const heights = Array(columns).fill(ORIGIN_Y);
    for (const box of members) {
      let column = 0;
      for (let i = 1; i < heights.length; i++) if (heights[i] < heights[column]) column = i;
      pos[box.id] = [x0 + column * columnWidth, heights[column]];
      heights[column] += box.h + rowGap;
    }
    x0 += columns * columnWidth + zoneGap;
  }
  return pos;
}

// Score of a layout: line crossings plus lines running under other tables, total line length as tie-breaker.
export function layoutScore(nodes, edges) {
  const segments = edges.map(([a, b]) => [nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y]);
  let crossings = 0, under = 0, length = 0;
  const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
  for (let i = 0; i < edges.length; i++) {
    const [x1, y1, x2, y2] = segments[i];
    length += Math.hypot(x2 - x1, y2 - y1);
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i], f = edges[j];
      if (e[0] === f[0] || e[0] === f[1] || e[1] === f[0] || e[1] === f[1]) continue;
      const [x3, y3, x4, y4] = segments[j];
      const d1 = ccw(x3, y3, x4, y4, x1, y1), d2 = ccw(x3, y3, x4, y4, x2, y2), d3 = ccw(x1, y1, x2, y2, x3, y3), d4 = ccw(x1, y1, x2, y2, x4, y4);
      if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) crossings++;
    }
    for (let k = 0; k < nodes.length; k++) {
      if (k === edges[i][0] || k === edges[i][1]) continue;
      const n = nodes[k], hw = n.w / 2, hh = n.h / 2;
      // Liang-Barsky clip of the segment against the table's rectangle.
      let t0 = 0, t1 = 1, hit = true;
      const dx = x2 - x1, dy = y2 - y1;
      const p = [-dx, dx, -dy, dy], q = [x1 - (n.x - hw), n.x + hw - x1, y1 - (n.y - hh), n.y + hh - y1];
      for (let s = 0; s < 4 && hit; s++) {
        if (p[s] === 0) { if (q[s] < 0) hit = false; continue; }
        const r = q[s] / p[s];
        if (p[s] < 0) { if (r > t1) hit = false; else if (r > t0) t0 = r; } else { if (r < t0) hit = false; else if (r < t1) t1 = r; }
      }
      if (hit) under++;
    }
  }
  return { crossings, under, length, total: crossings + under + length / 200000 };
}

// Stress layout: every pair of tables wants a distance that grows with the number of relation steps between them.
function stressLayout(nodes, springs, iterations, unit) {
  const n = nodes.length, INF = 1e9;
  const radius = nodes.map(v => Math.hypot(v.w, v.h) / 2);
  const hop = Array.from({ length: n }, () => new Float64Array(n).fill(INF));
  for (let i = 0; i < n; i++) hop[i][i] = 0;
  for (const [a, b, weight] of springs) { const cost = 1 / weight; if (cost < hop[a][b]) { hop[a][b] = cost; hop[b][a] = cost; } }
  for (let m = 0; m < n; m++) for (let i = 0; i < n; i++) {
    const viaM = hop[i][m];
    if (viaM >= INF) continue;
    for (let j = 0; j < n; j++) { const v = viaM + hop[m][j]; if (v < hop[i][j]) hop[i][j] = v; }
  }
  let maxHop = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (hop[i][j] < INF && hop[i][j] > maxHop) maxHop = hop[i][j];
  const want = [], weight = [];
  for (let i = 0; i < n; i++) {
    want.push(new Float64Array(n)); weight.push(new Float64Array(n));
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const h = hop[i][j] < INF ? hop[i][j] : maxHop + 1;
      want[i][j] = h * unit + (radius[i] + radius[j]) * 0.6;
      weight[i][j] = 1 / (want[i][j] * want[i][j]) * (hop[i][j] < INF ? 1 : 0.2);
    }
  }
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sw = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const ex = nodes[i].x - nodes[j].x, ey = nodes[i].y - nodes[j].y, d = Math.hypot(ex, ey) || 1e-3;
        sx += weight[i][j] * (nodes[j].x + want[i][j] * ex / d);
        sy += weight[i][j] * (nodes[j].y + want[i][j] * ey / d);
        sw += weight[i][j];
      }
      if (sw) { nodes[i].x = sx / sw; nodes[i].y = sy / sw; }
    }
  }
}

/** Pushes centred boxes ({x, y, w, h}, x/y = centre) apart until no two overlap (plus gaps). Returns true when done. */
export function removeOverlaps(nodes, gapX, gapY, maxPasses = 400) {
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j];
      const ox = (A.w + B.w) / 2 + gapX - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 + gapY - Math.abs(A.y - B.y);
      // Tolerance: float residue after a push would otherwise count as overlap forever and never converge.
      if (ox <= OVERLAP_EPSILON || oy <= OVERLAP_EPSILON) continue;
      moved = true;
      if (ox / gapX < oy / gapY) { const s = (A.x < B.x || (A.x === B.x && i < j) ? -1 : 1) * ox / 2; A.x += s; B.x -= s; }
      else { const s = (A.y < B.y || (A.y === B.y && i < j) ? -1 : 1) * oy / 2; A.y += s; B.y -= s; }
    }
    if (!moved) return true;
  }
  return false;
}

/** Deterministic pseudo-random numbers in [0, 1) from a 32-bit seed. */
export function seededRandom(seed) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Stress layout from several starts (the current positions first, then seeded random ones), overlap removal,
 * then a swap/nudge refinement scored by crossings and lines under tables. Same input -> same output.
 * @param boxes [{id, x, y, w, h}] top-left
 * @param relations [{from, to}] drawn as lines
 * @param options.extra [[idA, idB, weight]] pull without a line (e.g. members of one group)
 */
export function arrangeByRelations(boxes, relations, { extra = [], starts = 8, gapX = 70, gapY = 60, unit = 200, seed = 7919 } = {}) {
  if (!boxes.length) return { pos: {}, score: layoutScore([], []) };
  const index = Object.fromEntries(boxes.map((b, i) => [b.id, i]));
  const pairs = new Map();
  for (const r of relations) {
    const a = index[r.from], b = index[r.to];
    if (a == null || b == null || a === b) continue;
    const key = Math.min(a, b) + "-" + Math.max(a, b);
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  const lines = [...pairs.keys()].map(k => k.split("-").map(Number));
  const springs = [...pairs].map(([k, count]) => [...k.split("-").map(Number), 1 + Math.log(count) * 0.3]);
  for (const [p, q, w] of extra) if (index[p] != null && index[q] != null && index[p] !== index[q]) springs.push([index[p], index[q], w]);
  const area = boxes.reduce((s, b) => s + (b.w + 80) * (b.h + 60), 0), side = Math.sqrt(area) * 1.4;
  let best = null;
  for (let s = 0; s < starts; s++) {
    const random = seededRandom(seed * (s + 1));
    const nodes = boxes.map(b => (s === 0 ? { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h } : { x: random() * side, y: random() * side, w: b.w, h: b.h }));
    stressLayout(nodes, springs, 300, unit);
    removeOverlaps(nodes, gapX, gapY);
    const score = layoutScore(nodes, lines);
    if (!best || score.total < best.score.total) best = { nodes, score };
  }
  // Refinement on the overlap-free layout: swap two tables or nudge one; keep it only when nothing overlaps and the score drops.
  const nodes = best.nodes;
  let current = best.score.total;
  const free = i => nodes.every((B, j) => j === i || (nodes[i].w + B.w) / 2 + gapX * 0.6 <= Math.abs(nodes[i].x - B.x) || (nodes[i].h + B.h) / 2 + gapY * 0.6 <= Math.abs(nodes[i].y - B.y));
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const swap = () => { const tx = nodes[i].x, ty = nodes[i].y; nodes[i].x = nodes[j].x; nodes[i].y = nodes[j].y; nodes[j].x = tx; nodes[j].y = ty; };
      swap();
      const score = free(i) && free(j) ? layoutScore(nodes, lines).total : Infinity;
      if (score < current - 1e-9) { current = score; improved = true; } else swap();
    }
    for (let i = 0; i < nodes.length; i++) for (const step of [240, 120, 60]) for (const [sx, sy] of steps) {
      nodes[i].x += sx * step; nodes[i].y += sy * step;
      const score = free(i) ? layoutScore(nodes, lines).total : Infinity;
      if (score < current - 1e-9) { current = score; improved = true; } else { nodes[i].x -= sx * step; nodes[i].y -= sy * step; }
    }
    if (!improved) break;
  }
  const minX = Math.min(...nodes.map(v => v.x - v.w / 2)), minY = Math.min(...nodes.map(v => v.y - v.h / 2));
  const pos = {};
  boxes.forEach((b, i) => { pos[b.id] = [Math.round(nodes[i].x - b.w / 2 - minX + ORIGIN_X), Math.round(nodes[i].y - b.h / 2 - minY + ORIGIN_Y)]; });
  return { pos, score: layoutScore(nodes, lines) };
}
