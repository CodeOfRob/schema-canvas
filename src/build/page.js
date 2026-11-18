// Builds the single self-contained HTML page: bundled viewer script + stylesheet + injected data.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PAGE_DATA_GLOBAL } from "../viewer/model.js";

const viewerFile = name => fileURLToPath(new URL("../viewer/" + name, import.meta.url));

async function bundleViewer() {
  const result = await build({
    entryPoints: [viewerFile("main.js")],
    bundle: true,
    format: "iife",
    target: "es2020",
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

// Inline <script> content must never contain "</script" (or "<!--"); JSON gets "<" escaped, JS a backslash.
function scriptSafe(js) {
  return js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}
function jsonForScript(value) {
  // U+2028/U+2029 are legal in JS string literals since ES2019, so only "<" needs escaping.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * @param data { current, target?, layout?, config } - already validated (see src/model/)
 * @returns the HTML page as a string
 */
export async function buildPage(data) {
  const [template, css, js] = await Promise.all([readFile(viewerFile("template.html"), "utf8"), readFile(viewerFile("styles.css"), "utf8"), bundleViewer()]);
  const parts = {
    "/*__SCHEMA_CANVAS_STYLE__*/": css.replace(/<\/(style)/gi, "<\\/$1"),
    "/*__SCHEMA_CANVAS_DATA__*/": "window." + PAGE_DATA_GLOBAL + " = " + jsonForScript(data) + ";",
    "/*__SCHEMA_CANVAS_SCRIPT__*/": scriptSafe(js),
  };
  let html = template;
  for (const [marker, content] of Object.entries(parts)) {
    if (!html.includes(marker)) throw new Error("template marker missing: " + marker);
    // Function replacement: "$" sequences in the content must stay literal.
    html = html.replace(marker, () => content);
  }
  return html;
}
