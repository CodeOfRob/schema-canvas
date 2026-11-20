// Late-bound render and viewport functions. The UI modules (canvas, inspector, toolbar) and the state
// changes in actions.js call each other; going through this registry keeps the import graph acyclic.
// main.js binds the real implementations once, before the first render.
const NAMES = ["renderCanvas", "renderPanel", "renderChrome", "flash", "boxOf", "fitAll", "centerOn", "viewportSize", "worldPointAt", "previewPositions"];

const bound = {};

export const view = Object.fromEntries(NAMES.map(name => [name, (...args) => {
  if (!bound[name]) throw new Error("view." + name + " is not bound; call bindView() first");
  return bound[name](...args);
}]));

export function bindView(implementations) {
  for (const name of NAMES) {
    if (typeof implementations[name] !== "function") throw new Error("bindView: missing " + name);
    bound[name] = implementations[name];
  }
}
