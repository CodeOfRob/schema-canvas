// The table view's module marks: a tag in each table header and the legend's "Modules" section. Both use the module
// classes m-<i>, so their colours come from the same rules as the module view and the module filter (main.js).
import { S } from "../strings.js";
import { axisClass, axisKeys, axisLabel, moduleOf } from "./state.js";
import { esc } from "./html.js";

/** The tag for a table's header; empty for a table without a module (and so for every table of a page without modules). */
export function moduleTagHtml(entity) {
  const key = moduleOf(entity), cls = axisClass("module", key);
  if (!cls) return "";
  const label = axisLabel("module", key);
  return '<span class="mtag ' + cls + '" title="' + esc(S.moduleOfTable(label)) + '">' + esc(label) + "</span>";
}

/** One colour key per module, in config order; empty without modules. */
export function moduleLegendHtml() {
  return axisKeys("module").map(key => '<span class="mkey ' + axisClass("module", key) + '">' + esc(axisLabel("module", key)) + "</span>").join("");
}
