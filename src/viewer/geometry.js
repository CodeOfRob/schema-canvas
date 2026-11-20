// Small geometry helpers shared by the table canvas, the module view and the layouts.

/** Point where the line from the centre of box r towards (tx, ty) leaves the box. */
export function boxBorderPoint(r, tx, ty) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min(dx ? (r.w / 2) / Math.abs(dx) : Infinity, dy ? (r.h / 2) / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** True when segment p1-p2 properly crosses segment p3-p4 (points [x, y]); touching or collinear segments do not cross. */
export function segmentsCross(p1, p2, p3, p4) {
  const side = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  return side(p3, p4, p1) * side(p3, p4, p2) < 0 && side(p1, p2, p3) * side(p1, p2, p4) < 0;
}

/** Centred nodes ({id, x, y, w, h}, x/y = centre) from top-left boxes ({id, x, y, w, h}); the layouts compute on centres. */
export function centredNodes(boxes) {
  return boxes.map(b => ({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }));
}

/**
 * Top-left positions of centred nodes, the drawing's top-left corner moved to origin and every value rounded.
 * shift is what was added to each unrounded top-left corner, so in-between states can be drawn in the same frame.
 * @param nodes [{id, x, y, w, h}] x/y = centre, @param origin [x, y]
 * @returns {{ pos: Record<string, [number, number]>, shift: [number, number] }}
 */
export function positionsAtOrigin(nodes, [originX, originY] = [0, 0]) {
  const minX = Math.min(...nodes.map(n => n.x - n.w / 2)), minY = Math.min(...nodes.map(n => n.y - n.h / 2));
  const pos = {};
  for (const n of nodes) pos[n.id] = [Math.round(n.x - n.w / 2 - minX + originX), Math.round(n.y - n.h / 2 - minY + originY)];
  return { pos, shift: [originX - minX, originY - minY] };
}

/** Edge-to-edge distance of two top-left boxes ({x, y, w, h}); 0 when they touch or overlap. */
export function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Boxes grouped into islands: two boxes at most gap apart (edge to edge, also through a chain) share one. */
export function islandsWithin(boxes, gap) {
  const parent = boxes.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxGap(boxes[i], boxes[j]) <= gap) parent[find(i)] = find(j);
  const islands = new Map();
  boxes.forEach((b, i) => { const root = find(i); if (!islands.has(root)) islands.set(root, []); islands.get(root).push(b); });
  return [...islands.values()];
}

/**
 * Convex hull of points [x, y] (Andrew's monotone chain): starts at the lowest x (then lowest y) and runs
 * counter-clockwise in y-up terms (clockwise on screen); inner and collinear points are dropped.
 */
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = list => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}
