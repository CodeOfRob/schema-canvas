import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/viewer/markdown.js";

test("paragraphs, lists and inline formatting", () => {
  assert.equal(renderMarkdown("Open **questions** for the `Order` table\nstill *pending*."), "<p>Open <strong>questions</strong> for the <code>Order</code> table still <em>pending</em>.</p>");
  assert.equal(renderMarkdown("- one\n- two\n  continued\n\n## Next"), "<ul><li>one</li><li>two continued</li></ul>\n<h4>Next</h4>");
});

test("pipe tables with header and escaped pipes", () => {
  assert.equal(
    renderMarkdown("| Old | New |\n|---|---|\n| A | B \\| C |"),
    "<table><thead><tr><th>Old</th><th>New</th></tr></thead><tbody><tr><td>A</td><td>B | C</td></tr></tbody></table>",
  );
  assert.equal(renderMarkdown("| x | y |"), "<table><tbody><tr><td>x</td><td>y</td></tr></tbody></table>");
});

test("raw HTML is escaped, also inside code spans", () => {
  assert.equal(renderMarkdown("<script>alert(1)</script> `<b>`"), "<p>&lt;script&gt;alert(1)&lt;/script&gt; <code>&lt;b&gt;</code></p>");
});
