// Classification axes of a table: data kind (what the table holds) and module (which part of the system owns it).
// Both resolve the same way, so there is one resolver; an axis only says where its values live.
import { UNASSIGNED } from "../model/page-data.js";

/** The axes of a normalized config: the entity property, the declared categories and the by-name map. */
export function classificationAxes(config) {
  return {
    kind: { property: "kind", categories: config.dataKinds, byName: config.entityKinds },
    module: { property: "module", categories: config.modules, byName: config.entityModules },
  };
}

/**
 * Value of one axis for an entity: its own value (when declared), else the config map by name, else (target
 * tables) the value of its first assigned origin. UNASSIGNED stops the search and yields null.
 * ignoreOwn answers "what would it be automatically" for the inspector's select.
 */
export function classify(entity, axis, { ignoreOwn = false } = {}) {
  const own = entity[axis.property];
  if (!ignoreOwn && own === UNASSIGNED) return null;
  if (!ignoreOwn && own && axis.categories[own]) return own;
  const byName = axis.byName[entity.name];
  if (byName) return byName === UNASSIGNED ? null : byName;
  for (const name of entity.origin || []) if (axis.byName[name] && axis.byName[name] !== UNASSIGNED) return axis.byName[name];
  return null;
}
