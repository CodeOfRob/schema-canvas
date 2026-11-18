// A small, safe markdown subset for the text sections of config.json: headings, paragraphs, bullet lists,
// pipe tables, `code`, **bold** and *emphasis*. All text is HTML-escaped first; no raw HTML, no links.
import { esc as escapeHtml } from "./ui/html.js";

function inline(text) {
  // Code spans first, so their content is never formatted.
  return text.split(/(`[^`]*`)/).map(part => {
    if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) return "<code>" + escapeHtml(part.slice(1, -1)) + "</code>";
    return escapeHtml(part)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  }).join("");
}

// Cells split at "|" that is not escaped as "\|"; the outer pipes are optional.
function tableCells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));
}
const isTableSeparator = line => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim());

function table(lines) {
  const header = lines.length > 1 && isTableSeparator(lines[1]);
  const body = header ? lines.slice(2) : lines;
  const row = (cells, tag) => "<tr>" + cells.map(c => "<" + tag + ">" + inline(c) + "</" + tag + ">").join("") + "</tr>";
  return "<table>" + (header ? "<thead>" + row(tableCells(lines[0]), "th") + "</thead>" : "") +
    "<tbody>" + body.map(l => row(tableCells(l), "td")).join("") + "</tbody></table>";
}

function list(lines) {
  const items = [];
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) items.push(bullet[1]); else items[items.length - 1] += " " + line.trim();
  }
  return "<ul>" + items.map(i => "<li>" + inline(i) + "</li>").join("") + "</ul>";
}

/** Renders the markdown subset to HTML. Headings start at level 3 (the section title is the level-2 heading). */
export function renderMarkdown(source) {
  const html = [];
  const blocks = String(source).replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter(l => l.trim());
    if (!lines.length) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const level = heading[1].length + 2;
      html.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
    } else if (lines.every(l => l.trim().startsWith("|"))) {
      html.push(table(lines));
    } else if (/^\s*[-*]\s+/.test(lines[0])) {
      html.push(list(lines));
    } else {
      html.push("<p>" + inline(lines.map(l => l.trim()).join(" ")) + "</p>");
    }
  }
  return html.join("\n");
}
