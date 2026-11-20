// Module areas of the table view: a soft area in the module's colour behind the tables of each module. Drawing only:
// computed from the drawn boxes, never fed back into layout, arrangements or counts.
//
// Shape: one padded convex hull per island of a module's tables (tables at most MODULE_AREA_JOIN_GAP apart, edge to
// edge, share an island). Measured on the 130-table fixture (share of table area under another module's area / share
// of area covered by two modules): one box per module 61 % / 50 % after Arrange by forces and 84 % / 83 % after the
// star; one hull per module 40 % / 36 % and 54 % / 66 %; a hull per island 7 % / 6 % and 0 % / 0 %; a padded box per
// table 0 % / 0 % on both, but 7 separate pieces per module where hulls per island show 2.4 after the forces. Hulls per
// island keep a module that the forces gathered in one or two areas and still split a module the star spread out.
// Join gap 60 / 120 / 200 / 300 px gave 5.6 / 7.3 / 7.8 / 8.3 % under a foreign area and 3.1 / 2.4 / 2.3 / 2.2 pieces
// per module after the forces: 120 is where more joining stops paying off.
import { convexHull, islandsWithin } from "./geometry.js";

/** Distance of the area's outline from its tables, in px (drawn as a round stroke of twice this width). */
export const MODULE_AREA_PAD = 24;
export const MODULE_AREA_JOIN_GAP = 120;

/**
 * @param boxes [{x, y, w, h, module}] drawn tables, top-left; module is a key or null
 * @param moduleOrder module keys in config order; areas follow it (and the input order inside a module)
 * @returns [{ module, hull: [[x, y], ...] }] one per island; tables without a module (or of an unknown one) get none
 */
export function moduleAreas(boxes, moduleOrder) {
  return moduleOrder.flatMap(module => islandsWithin(boxes.filter(b => b.module === module), MODULE_AREA_JOIN_GAP).map(island => ({
    module,
    hull: convexHull(island.flatMap(b => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]])),
  })));
}

/** SVG path data of a closed polygon. */
export function areaPath(hull) {
  return hull.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join("") + "Z";
}
