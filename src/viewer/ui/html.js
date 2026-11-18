// Tiny HTML helpers for the string-templated UI.
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => ENTITIES[c]);
}

/** Binds an event on the element with the given id (if present); the handler gets (value, element). */
export function on(id, eventName, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(eventName, () => handler(el.value, el));
}

export function option(value, label, selected, disabled = false) {
  return '<option value="' + esc(value) + '"' + (selected ? " selected" : "") + (disabled ? " disabled" : "") + ">" + esc(label) + "</option>";
}
