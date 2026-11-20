// The table view's module marks: a tag in each table header, and the legend's colour keys (the "Modules" section and the
// data-kind key of the table colour). They use the axis classes k-<i> / m-<i>, so their colours come from the same rules
// as the tables, the module view and the filters (main.js).
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

/** One colour key per value of an axis ("kind" or "module"), in config order; empty when the page declares none. */
export function legendKeysHtml(axisName) {
  return axisKeys(axisName).map(key => '<span class="lkey ' + axisClass(axisName, key) + '">' + esc(axisLabel(axisName, key)) + "</span>").join("");
}
