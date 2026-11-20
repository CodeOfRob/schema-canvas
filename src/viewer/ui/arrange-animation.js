// Plays an automatic arrangement frame by frame before it is applied. A frame only moves the drawn tables and
// redraws the lines (view.previewPositions): no commit, no refresh, so state, undo and storage see nothing until the
// final positions are applied, exactly once (one undo step). Any click or key press ends the animation at once
// with the same final positions, so the user's input always acts on the finished layout.
import { view } from "./view.js";

// Duration of the animation, in ms. Each frame asks for the state at the share of this duration that has passed,
// so the whole arrangement plays in this time at any frame rate and ends exactly where the static run ends.
// One step per frame was measured first: a 130-table page drew 30 frames per second (about 7 ms of script per frame,
// the rest painting), so 3 s showed only 86 of the 300 steps and the final layout then jumped a median 250 px.
// 2 s is long enough to follow where the tables travel and short enough not to wait for a layout to work with.
const ANIMATION_MS = 2000;

let running = null;

const prefersReducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Ends a running animation now, applying its final positions (no-op when none runs). */
function finishRunning() {
  const run = running;
  if (!run) return;
  running = null;
  cancelAnimationFrame(run.frame);
  window.removeEventListener("pointerdown", finishRunning, true);
  window.removeEventListener("keydown", finishRunning, true);
  run.applyFinal();
}

/**
 * @param frameAt (share) => {id: [x, y]} | null: the in-between positions once share (0..1) of the duration has
 *   passed, null once the arrangement has settled
 * @param applyFinal () => void: applies the final positions (one commit)
 */
export function playArrangement(frameAt, applyFinal) {
  finishRunning();
  if (prefersReducedMotion()) { applyFinal(); return; }
  const startedAt = performance.now();
  const run = { applyFinal, frame: 0 };
  const step = now => {
    if (running !== run) return;
    const share = (now - startedAt) / ANIMATION_MS;
    const positions = share < 1 ? frameAt(share) : null;
    if (!positions) { finishRunning(); return; }
    view.previewPositions(positions);
    run.frame = requestAnimationFrame(step);
  };
  running = run;
  // Capture phase: the animation ends before the click or key reaches its own handler.
  window.addEventListener("pointerdown", finishRunning, true);
  window.addEventListener("keydown", finishRunning, true);
  run.frame = requestAnimationFrame(step);
}
