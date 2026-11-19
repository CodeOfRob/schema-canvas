# Changelog

## Unreleased

- Modules: optional `module` per table, `modules` (with `dependsOn` layer rules) and `entityModules` in
  `config.json`, a module selector in the inspector and module filter buttons. A **Modules** view folds the
  tables into one box per module with the foreign-key count per direction; arrows that break `dependsOn` or lie
  on a cycle between modules are red. Data kind and module resolve the same way (own value, by name, origin).
- Tile tables: `tileTables` entries may be `{ "name", "display": "badge" }`; the relations are then shown as a
  badge "-> Table" on the foreign-key field instead of a tile. The inspector offers lines / tile / badge per
  viewer. Preferences saved by earlier versions keep working.
- `dataKinds` entries reject unknown keys (a typo such as `colour` was silently dropped before).

- Fix: a state saved against an older built-in target model (in this browser or in the shared store) no longer
  silently replaces the newer target of a rebuilt page. Snapshots record the fingerprint of the built-in target
  they were based on (`base`); on a mismatch the page asks whether to use the page's version or keep the saved
  state. Snapshots without `base` count as based on an older version.
- Diff: the `fk` flag is compared too; a field whose only difference is the foreign-key flag counts as changed.
- File export inside a claude.ai artifact: when the host offers the `downloads` capability, exports are saved
  through it; otherwise the usual browser download is used. A host that declines shows a short message.

- Review marker: `reviewed` on target tables, a checkbox in each table header and a toolbar button that dims
  the reviewed tables and counts them.
- `changed: true` on a target field counts it as changed when type, keys and default stay equal (new values,
  new meaning); checkbox in the field inspector.
- Indexes: optional `note` (why the index exists) and expression entries such as `lower(email)`.
- config.json: `description` under the title, text `sections` below the canvas (small markdown subset),
  `description` per data kind, `strings` to replace or translate every interface text, `language`.
- Third automatic layout: a star around the selected (or most central) table.
- Fix: relations of merged tables that share a key all get a diff status; before, all but one silently
  counted as unchanged.

## 0.1.0

Initial public release.

- CLI: `model` and `build` commands.
- Adapters for Prisma (via `@prisma/internals`) and PostgreSQL and other databases (via tbls JSON).
- Self-contained interactive ER-diagram page: pan, zoom, drag, inspector, lasso selection, light and dark theme.
- Optional target model with a diff based on structured `origin` references (new, removed, renamed, merged, moved, changed).
- In-browser editing of the target model with undo.
- Data kinds with colours, zones and filters; two automatic layouts; tile mode for hub tables.
- Storage in localStorage, as JSON files, or in a claude.ai artifact shared database, with a keep-mine / take-theirs conflict dialog.
- `npm run lint:arch` boundary rules (dependency-cruiser).
