// Which built-in target model a saved snapshot was based on, and what to do with a snapshot at load.
// A page can be rebuilt with a changed built-in target; a snapshot saved against the old one must not
// silently replace the new one.

// Keys sorted at every level, so the fingerprint does not depend on property order.
function canonicalJson(value) {
  return JSON.stringify(value, (key, v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v));
}

// 53-bit string hash (cyrb53). Detects changes between page versions; not meant to resist crafted collisions.
function hash53(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Fingerprint of a normalized model (the `base` of a snapshot), or null for a page without a target model. */
export function fingerprintModel(model) {
  return model ? hash53(canonicalJson(model)).toString(36) : null;
}

/**
 * What to do with a saved snapshot at load.
 * @param builtInBase fingerprint of the page's built-in target (null: the page has no target model)
 * @param snapshot    parsed snapshot ({ base: string|null, target, ... }) or null
 * @returns "none" (nothing saved) | "apply" (safe to apply) | "ask" (based on another built-in target; the viewer decides)
 */
export function decideSavedState(builtInBase, snapshot) {
  if (!snapshot) return "none";
  if (builtInBase === null) return "apply";
  if (snapshot.base === builtInBase) return "apply";
  // A saved target identical to the built-in one loses nothing whichever way; no need to ask.
  return fingerprintModel(snapshot.target) === builtInBase ? "apply" : "ask";
}
