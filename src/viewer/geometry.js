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
