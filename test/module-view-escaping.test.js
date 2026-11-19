import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// config.strings can replace every UI text, so a text put into markup must pass through esc().
// Static check (the tests have no DOM): on every line that builds markup, each plain S.<name> text must sit
// inside an esc( ... ) call. Functions (S.<name>(...)) are skipped: their results go through esc() at the consumer.
const source = readFileSync(new URL("../src/viewer/ui/module-view.js", import.meta.url), "utf8");

function unescapedTexts(line) {
  const found = [];
  for (const m of line.matchAll(/\bS\.\w+(?![\w(])/g)) {
    let depth = 0, escaped = false;
    for (let i = m.index - 1; i >= 0 && !escaped; i--) {
      if (line[i] === ")") depth += 1;
      else if (line[i] === "(") {
        if (depth === 0) escaped = line.slice(Math.max(0, i - 3), i) === "esc";
        else depth -= 1;
      }
    }
    if (!escaped) found.push(m[0]);
  }
  return found;
}

test("module view never puts S.* texts raw into markup", () => {
  const markupLines = source.split("\n").filter(line => /\bhtml\b\s*\+?=|\bhtml\b\s*\+=|<\w+/.test(line));
  assert.deepEqual(markupLines.flatMap(unescapedTexts), []);
});
