// Loads and validates the data the CLI injected into the page (window.__SCHEMA_CANVAS__).
import { normalizeModel } from "../model/normalize.js";
import { emptyLayout, normalizeConfig, normalizeLayout } from "../model/page-data.js";

export const PAGE_DATA_GLOBAL = "__SCHEMA_CANVAS__";
export const STATE_FORMAT = "schema-canvas/state";

/** @returns {{ current, target: object|null, layout, config }}; throws with a readable message on bad data */
export function loadPageData(raw) {
  if (!raw || typeof raw !== "object") throw new Error("window." + PAGE_DATA_GLOBAL + " is missing; build the page with `schema-canvas build`");
  return {
    current: normalizeModel(raw.current, "current model"),
    target: raw.target ? normalizeModel(raw.target, "target model") : null,
    layout: raw.layout ? normalizeLayout(raw.layout, "layout") : emptyLayout(),
    config: normalizeConfig(raw.config || {}, "config"),
  };
}

/**
 * Validates a saved state snapshot ({ format, target, layout, savedAt }) from storage or another tab.
 * Returns the normalized snapshot or throws; never returns a half-valid one.
 */
export function parseSnapshot(raw, expectTarget) {
  if (!raw || raw.format !== STATE_FORMAT) throw new Error("not a " + STATE_FORMAT + " snapshot");
  if (typeof raw.savedAt !== "string") throw new Error("snapshot without savedAt");
  const target = expectTarget ? normalizeModel(raw.target, "saved target model") : null;
  return { format: STATE_FORMAT, target, layout: normalizeLayout(raw.layout, "saved layout"), savedAt: raw.savedAt };
}

/** Storage key prefix for this page: config.storageKey, else derived from the title or model name. */
export function storageKeyFor(config, current) {
  if (config.storageKey) return config.storageKey;
  const base = (config.title || current.name || "schema").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return "schema-canvas:" + (base || "schema");
}
