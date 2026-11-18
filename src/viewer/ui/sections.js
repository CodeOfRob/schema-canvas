// Static page text from config.json: the description under the title and the text sections below the canvas.
import { renderMarkdown } from "../markdown.js";
import { esc } from "./html.js";

export function renderPageText(config) {
  const description = document.getElementById("description");
  description.hidden = !config.description;
  description.innerHTML = config.description ? renderMarkdown(config.description) : "";
  description.title = description.textContent;
  const host = document.getElementById("sections");
  host.innerHTML = config.sections.map(s => '<div class="card text"><h2>' + esc(s.title) + '</h2><div class="md">' + renderMarkdown(s.markdown) + "</div></div>").join("");
}
