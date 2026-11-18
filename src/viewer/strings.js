// Every user-visible text of the viewer. Keep wording here, never inline in the UI modules.

export const STATUS_LABEL = {
  added: "new",
  renamed: "renamed",
  moved: "moved",
  merged: "merged",
  changed: "changed",
  removed: "removed",
  same: "unchanged",
};

export const S = {
  defaultTitle: "Schema",
  viewTarget: "Target",
  viewCurrent: "Current",
  legendLabel: "Legend",
  legendRenamed: "renamed / moved / merged",
  countsTitle: "Tables, relations and indexes in the shown model; the other model in brackets",
  counts: (view, tables, relations, indexes) => view + ": " + tables + " tables · " + relations + " relations · " + indexes + " indexes",

  editGroup: "Edit",
  addTable: "+ Table",
  addRelation: "+ Relation",
  addGroup: "+ Group",
  undo: "Undo",
  undoTitle: "Undo (Ctrl/Cmd + Z)",
  zoomGroup: "Zoom",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  fit: "Show all",
  viewMenu: "View",
  showIndexes: "Indexes in tables",
  showIndexesTitle: "Show indexes inside the tables",
  tileListTitle: "Tables whose relations are drawn as small tiles instead of lines. Toggle in a table's details.",
  tileListLabel: "As tile:",
  tileListEmpty: "none",
  untile: name => "Draw relations of " + name + " as lines again",
  arrangeByRelations: "Arrange by relations",
  arrangeByRelationsTitle: "Related tables close together, few crossing lines and few lines under tables",
  arrangeRadial: "Arrange as a star",
  arrangeRadialTitle: "The selected table (or the most central one) in the middle, every further relation step one ring further out, each branch in its own slice",
  arrangeByKind: "Arrange by data kind",
  zoneGap: "Join zones up to",
  zoneGapTitle: "Distance between two tables of the same data kind above which their background zone splits into two islands",
  groupJoin: "Join group up to",
  groupJoinTitle: "How close a dropped table must be to a group's tables to become a member",
  restoreLayout: "Restore my layout",
  restoreLayoutTitle: "Restores the positions from before the first automatic arrangement; later moves are lost",
  fullscreen: "Full screen",
  fullscreenExit: "Exit full screen",
  kindFilterGroup: "Show data kinds",
  kindFilterTitle: label => label + ": click to hide or show",
  kindNone: "Unclassified",
  dimReviewed: "Reviewed",
  dimReviewedTitle: "Dim the reviewed tables of the target; tick a table in its header to mark it as reviewed",
  reviewedCheckboxTitle: "Reviewed",
  reviewedCheckboxLabel: name => name + " reviewed",
  moreMenu: "More",
  moreMenuLabel: "More actions",
  exportTarget: "Export target model",
  exportLayout: "Export layout",
  importTarget: "Import target model …",
  importLayout: "Import layout …",
  resetTarget: "Reset to page data",
  resetLayout: "Reset layout to page data",
  resetConfirm: "Discard all edits?",
  enumsTitle: "Enums",
  enumsEmpty: "This model defines no enums.",

  hintLinkFirst: "Click the referencing table (Esc cancels)",
  hintLinkSecond: "Click the referenced table",
  hintGrouping: "Click tables to add them to the group or remove them (Esc ends)",

  backToSummary: "← All changes",
  backToTables: "← All tables",
  helpTitleEdit: "Working on the target",
  helpEdit: "Drag a table by its header · double-click a name to rename it · click a table, field or relation label for details here · click and hold the background to pan · wheel zooms · Shift + drag selects several tables (lasso), dragging one of their headers moves all, Esc clears the selection.",
  helpTitleCurrent: "Current state",
  helpCurrent: "Read only. Red: removed, blue: renamed, moved or merged, yellow: changed.",
  helpTitleViewer: "Schema",
  helpViewer: "Drag a table by its header · click a table, field or relation label for details · click and hold the background to pan · wheel zooms · arrow keys pan.",
  summaryAdded: "New tables",
  summaryRenamed: "Renamed / merged",
  summaryChanged: "Changed tables",
  summaryRemoved: "Removed",
  summaryTables: "Tables",
  summaryRelations: "Relations",
  summaryRelationText: (added, removed, changed) => added + " new in the target, " + removed + " removed from the current state, " + changed + " with changed cardinality. New lines are green, removed ones dashed in the current view.",
  unresolvedTitle: "Unresolved origins",
  unresolvedText: "These origin references point to nothing in the current model, so the diff ignores them:",

  tableName: "Table name",
  fromOrigins: origins => "from " + origins,
  becomes: names => "becomes " + names,
  dataKind: "Data kind",
  kindAutomatic: label => "automatic (" + label + ")",
  kindExplicitNone: "none",
  note: "Note",
  tileToggle: "Draw relations as tiles",
  tileToggleTitle: "Instead of long lines, every connected table gets a small tile with this name. Only for your view.",
  fields: "Fields",
  addField: "+ Field",
  indexes: "Indexes",
  indexesEmpty: "No indexes besides the primary key.",
  indexUnique: "UK",
  indexPlain: "IX",
  lostHere: "Lost here",
  replaces: "Continues current table(s)",
  replacesHelp: "Tick when this table continues a current table, or merges several.",
  deleteTable: "Delete table",
  confirmAgain: "Really? Click again",
  configNote: "Note from the configuration",

  fieldName: "Field name",
  fieldType: "Type",
  fieldDefault: "Default",
  fieldFlags: { pk: "PK", uk: "UK", fk: "FK", nullable: "nullable", list: "list" },
  fieldChanged: "changed in content",
  fieldChangedTitle: "Counts the field as changed although type, keys and default stay the same, e.g. new values or a new meaning",
  inTarget: refs => "in the target: " + refs,
  originTitle: "Origin in the current model",
  originHelp: "Without an origin the field counts as new. With an origin in another table it counts as moved.",
  originAdd: "Add origin …",
  originRemove: "Remove origin",
  moveField: "Move to another table",
  moveFieldPick: "Choose table …",
  deleteField: "Delete field",

  relation: "Relation",
  relationFrom: "From (referencing)",
  relationTo: "To (referenced)",
  cardinalityFrom: "Cardinality at from",
  cardinalityTo: "at to",
  fromFields: "Foreign-key fields",
  toFields: "Referenced fields",
  label: "Label",
  via: fields => "via " + fields,
  deleteRelation: "Delete relation",

  group: "Group",
  groupName: "Name",
  groupDefaultName: "New group",
  groupFallbackName: "Group",
  groupPick: "Add / remove tables",
  groupPickEnd: "End selection",
  groupDragHelp: "Dragging the name tag moves every table of the group.",
  groupLabelTitle: "Drag moves the group, click opens it",
  groupTables: "Tables",
  groupDissolve: "Dissolve group",
  groupDissolveHelp: "The tables stay.",

  nameTaken: name => "\"" + name + "\" already exists",
  arranging: "Arranging …",
  loading: "Loading …",
  unsaved: "Unsaved …",
  savedAt: time => "Saved " + time,
  savedLocal: "Saved in this browser only",
  savedNowhere: "Not saved: this browser blocks storage. Use More → Export.",
  saveDenied: "No write permission; saved in this browser only",
  saveFailed: "Saving failed; saved in this browser only",
  saveInvalid: message => "Not saved, the model is invalid: " + message,
  loadedLocal: "Loaded your edits from this browser (More → Reset restores the page data)",
  loadedShared: "Loaded the shared saved state",
  sharedEmpty: "Shared storage connected (no saved edits yet)",
  sharedUnreachable: "Shared storage unreachable; edits stay in this browser",
  subscriptionError: "Live sync interrupted; edits by others appear only after a reload",
  remoteInvalid: "Ignored a saved state from elsewhere: it is not a valid model",
  adopted: "Took the newest saved state",
  conflictText: "While you were editing, a newer state was saved elsewhere",
  conflictTheirs: "Take theirs (discard my latest edits)",
  conflictMine: "Keep mine (overwrites theirs)",
  conflictStatus: "Conflict: please choose",
  imported: name => "Imported " + name,
  importFailed: message => "Import failed: " + message,
  exported: name => "Downloaded " + name,
  resetDone: "Reset to the page data",
  dataError: "This page could not load its schema data",
};

// ---------- overrides from config.strings (translations, own wording) ----------
// Keys are the names above; "status.<status>" and "fieldFlags.<flag>" reach the nested tables. Texts that take
// values use numbered placeholders in argument order, e.g. counts: "{0}: {1} Tische · {2} Linien · {3} Indizes".

function overrideTarget(key) {
  const [head, tail, ...rest] = key.split(".");
  if (rest.length) return null;
  if (tail === undefined) return Object.hasOwn(S, head) && typeof S[head] !== "object" ? { table: S, key: head } : null;
  const table = head === "status" ? STATUS_LABEL : head === "fieldFlags" ? S.fieldFlags : null;
  return table && Object.hasOwn(table, tail) ? { table, key: tail } : null;
}

/** Problems of a config.strings map (unknown keys, placeholders beyond the arguments); empty when usable. */
export function checkStringOverrides(overrides) {
  const issues = [];
  for (const [key, text] of Object.entries(overrides)) {
    const target = overrideTarget(key);
    if (!target) { issues.push("strings: unknown key \"" + key + "\""); continue; }
    const current = target.table[target.key];
    const arity = typeof current === "function" ? current.length : 0;
    for (const [, n] of String(text).matchAll(/\{(\d+)\}/g)) {
      if (Number(n) >= arity) issues.push("strings." + key + ": placeholder {" + n + "} but the text gets " + arity + " value(s)");
    }
  }
  return issues;
}

/** Replaces texts before anything renders; throws on overrides checkStringOverrides rejects. */
export function applyStringOverrides(overrides) {
  const issues = checkStringOverrides(overrides);
  if (issues.length) throw new Error(issues.join("; "));
  for (const [key, text] of Object.entries(overrides)) {
    const { table, key: name } = overrideTarget(key);
    table[name] = typeof table[name] === "function" ? (...values) => text.replace(/\{(\d+)\}/g, (_, n) => String(values[Number(n)])) : text;
  }
}
