// Which relation lines a viewer has switched off in the legend. Line types are the diff statuses a relation can
// have plus "opaque" (a reference without foreign key). Hiding is drawing only: positions, counts, the inspector,
// exports and the arrangements never look at it.

/** Every switchable line type, in legend order. Relations are never renamed/moved/merged, so those are no line type. */
export const LINE_TYPES = ["added", "changed", "removed", "same", "opaque"];
const STATUS_TYPES = new Set(["added", "changed", "removed", "same"]);

/**
 * @param relation the relation, @param status its diff status in the shown view ("same" without a diff)
 * @param hiddenTypes Set of hidden line types
 * @param withDiff false in a pure viewer: there is no status legend, so status types must not hide anything
 */
export function isRelationHidden(relation, status, hiddenTypes, withDiff) {
  if (relation.opaque === true && hiddenTypes.has("opaque")) return true;
  return withDiff && STATUS_TYPES.has(status) && hiddenTypes.has(status);
}

/**
 * The hidden line types from the stored preference. Before the line toggles there was only "hide opaque
 * references" (a boolean): without a stored list it decides, so a viewer who had them hidden keeps them hidden.
 */
export function hiddenLineTypesFrom(stored, legacyHideOpaque) {
  if (Array.isArray(stored)) return new Set(stored.filter(type => LINE_TYPES.includes(type)));
  if (stored == null && legacyHideOpaque === true) return new Set(["opaque"]);
  return new Set();
}
