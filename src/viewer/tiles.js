// Tile tables: tables nearly everything references (accounts, memberships). Their relations are not drawn as
// lines but as a name tile above the referencing table or as a badge on the foreign-key field. tileOf() is the
// single rule for "this relation is not a line"; canvas, layouts and the module view all ask it.
import { TILE_DISPLAYS } from "../model/page-data.js";

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * A badge stands for "a reference TO this table": only relations whose target is a badge table become badges
 * (on the referencing side, also when that side is a tile or badge table itself); a badge table's own foreign
 * keys stay lines. A tile replaces every relation touching exactly one tile-display table, in either direction.
 * @param model normalized model the relation belongs to
 * @param {Map<string, "tile" | "badge">} displays tile table name -> display
 * @returns {{ tile, other: string, display } | null} the tile table, the other entity id and how to show it;
 *   null when the relation is a line (no tile or badge rule applies, or a self relation)
 */
export function tileOf(model, relation, displays) {
  if (relation.from === relation.to) return null;
  const a = model.entities.find(e => e.id === relation.from), b = model.entities.find(e => e.id === relation.to);
  if (b && displays.get(b.name) === "badge") return { tile: b, other: relation.from, display: "badge" };
  if (a && displays.get(a.name) === "badge") return null;
  const ta = !!a && displays.get(a.name) === "tile", tb = !!b && displays.get(b.name) === "tile";
  if (ta === tb) return null;
  const tile = ta ? a : b;
  return { tile, other: ta ? relation.to : relation.from, display: "tile" };
}

/**
 * The tile displays of one viewer: a stored choice ({ name: display }) wins over the config default.
 * Earlier versions stored a plain list of names; those keep meaning "tile". Anything unreadable falls back.
 */
export function tileDisplaysFrom(stored, configTileTables) {
  if (Array.isArray(stored) && stored.every(name => typeof name === "string")) return new Map(stored.map(name => [name, "tile"]));
  if (isPlainObject(stored) && Object.values(stored).every(display => TILE_DISPLAYS.includes(display))) return new Map(Object.entries(stored));
  return new Map(configTileTables.map(t => [t.name, t.display]));
}
