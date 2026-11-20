import { test } from "node:test";
import assert from "node:assert/strict";
import { isArrangementPlaying, playArrangement } from "../src/viewer/ui/arrange-animation.js";
import { bindView } from "../src/viewer/ui/view.js";

// A browser stand-in: frames via timers, motion allowed, pointer and key listeners recorded.
const listeners = new Map();
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  addEventListener: (type, fn) => listeners.set(type, fn),
  removeEventListener: type => listeners.delete(type),
};
globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 5);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
const noop = () => {};
bindView(Object.fromEntries(["renderCanvas", "renderPanel", "renderChrome", "flash", "boxOf", "fitAll", "centerOn", "viewportSize", "worldPointAt", "previewPositions"].map(name => [name, noop])));

test("while an arrangement plays it counts as busy (remote states wait, as during a drag); afterwards it does not", async () => {
  let applied = 0, frames = 0;
  assert.equal(isArrangementPlaying(), false);
  playArrangement(() => (++frames < 3 ? { a: [frames, 0] } : null), () => { applied += 1; });
  assert.equal(isArrangementPlaying(), true);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(applied, 1, "the final positions apply once");
  assert.equal(isArrangementPlaying(), false);
});

test("a key press ends the animation at once: no longer busy, final positions applied", () => {
  let applied = 0;
  playArrangement(() => ({ a: [0, 0] }), () => { applied += 1; });
  assert.equal(isArrangementPlaying(), true);
  listeners.get("keydown")();
  assert.equal(applied, 1);
  assert.equal(isArrangementPlaying(), false);
});
