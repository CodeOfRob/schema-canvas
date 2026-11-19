// Tile tables: tables nearly everything references (accounts, memberships). Their relations are not drawn as
// lines but as a name tile above the referencing table or as a badge on the foreign-key field. tileOf() is the
// single rule for "this relation is not a line"; canvas, layouts and the module view all ask it.
import { TILE_DISPLAYS } from "../model/page-data.js";

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * @param model normalized model the relation belongs to
 * @param {Map<string, "tile" | "badge">} displays tile table name -> display
 * @returns {{ tile, other: string, display } | null} the tile table, the other entity id and how to show it;
 *   null when the relation is a line (no tile table, both ends tile tables, or a self relation)
 */
export function tileOf(model, relation, displays) {
  if (relation.from === relation.to) return null;
  const a = model.entities.find(e => e.id === relation.from), b = model.entities.find(e => e.id === relation.to);
  const ta = !!a && displays.has(a.name), tb = !!b && displays.has(b.name);
  if (ta === tb) return null;
  const tile = ta ? a : b;
  return { tile, other: ta ? relation.to : relation.from, display: displays.get(tile.name) };
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
