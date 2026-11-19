# config.json and layout.json

Both are optional side files passed to `build`. Unknown keys are rejected so typos do not go unnoticed.

## config.json

```json
{
  "title": "Bookshop schema",
  "description": "Current database and the agreed **target**.",
  "language": "en",
  "storageKey": "bookshop-schema",
  "dbDocPath": "schema-canvas/state",
  "tileTables": ["Edition", { "name": "Account", "display": "badge" }],
  "dataKinds": { "catalog": { "label": "Catalog", "color": "#0060a3", "description": "long-lived" }, "sales": { "label": "Sales" } },
  "entityKinds": { "Book": "catalog", "Order": "sales" },
  "modules": { "catalog": { "label": "Catalog", "dependsOn": [] }, "ordering": { "label": "Ordering", "color": "#a86400", "dependsOn": ["catalog"] } },
  "entityModules": { "Book": "catalog", "Order": "ordering" },
  "notes": { "Inventory": "Shown in the table's details." },
  "sections": [{ "title": "Open questions", "markdown": "- Shareable wishlists?" }],
  "strings": { "addTable": "+ Entity" }
}
```

| Key | Meaning |
|---|---|
| `title` | Page title (default: the model name) |
| `description` | Text under the title (markdown subset, see below) |
| `language` | Language tag of the page (`lang` attribute), e.g. when `strings` translate the interface |
| `storageKey` | Prefix for browser storage (default: derived from the title or model name). Give pages that share an origin different keys. |
| `dbDocPath` | Document path in the shared artifact store, see [storage.md](storage.md) (default `schema-canvas/state`) |
| `tileTables` | Tile tables by default: a table name (drawn as tiles) or `{ "name", "display": "tile" \| "badge" }`; each viewer can change this for themselves |
| `dataKinds` | Data kinds with `label`, optional CSS `color` and optional `description` (tooltip of the filter button); their order is the zone order. Without a colour a palette colour is used. |
| `entityKinds` | Kind per table name; target tables inherit the kind of their origin. `"none"` is reserved for "no kind". |
| `modules` | Modules with `label`, optional CSS `color`, `description` and `dependsOn` (keys of modules it may reference); their order is the box and filter order |
| `entityModules` | Module per table name, for models whose tables carry no `module` (for example a current model from an adapter); target tables inherit the module of their origin. `"none"` is reserved for "no module". |
| `notes` | Extra note per table name, shown in the inspector |
| `sections` | Text cards below the canvas, `[{ "title", "markdown" }]`: decisions, open questions, glossaries |
| `strings` | Replacement texts for the interface, see below |

### Text sections and the markdown subset

`description` and `sections[].markdown` accept a small, safe markdown subset: paragraphs (blank line between),
`#` to `###` headings, `-` or `*` bullet lists, pipe tables (`| a | b |`, optional `|---|---|` header line,
`\|` for a literal pipe), `` `code` ``, `**bold**` and `*emphasis*`. Everything else is shown as text; raw
HTML is escaped and links are not supported.

### Interface texts (`strings`)

Every interface text can be replaced, for a translation or your own wording. Keys are the names in
[`src/viewer/strings.js`](../src/viewer/strings.js); `status.<status>` and `fieldFlags.<flag>` reach the
status labels and field flags. Texts that contain values take numbered placeholders in argument order:

```json
{ "strings": { "viewTarget": "Soll", "status.added": "neu", "counts": "{0}: {1} Tabellen · {2} Beziehungen · {3} Indizes" } }
```

`build` rejects unknown keys and placeholders beyond the values a text receives.

### Data kinds and zones

A data kind groups tables by what they hold (for example `catalog` vs. `sales`). Kinds colour the table
border, draw a background zone behind the tables of one kind and drive the filter buttons in the toolbar.
"Arrange by data kind" lays the zones out side by side.

### Tile tables

A busy table that nearly everything references (accounts, users) produces long lines everywhere. Mark it
as a tile table and choose how its relations are shown instead of a line:

- `"tile"` (default, also a plain name): a small name tile above each referencing table;
- `"badge"`: a badge "-> Account" on the referencing foreign-key field, nothing drawn between the tables. Only
  references *to* the badge table become badges; its own foreign keys (`Account -> Role`) stay normal lines.

`tileTables` sets the default; the select in the inspector is a per-browser preference. Relations to tile
tables do not pull tables together in the automatic layouts and form no edge in the module view.

### Modules and the module view

A module says which part of the system owns a table, independent of its data kind and of layout groups.
Assign it per table (`module` in the model, editable in the inspector) or by name with `entityModules`. When
`modules` is set, the toolbar offers **Modules**: one box per module (table count, foreign keys inside, and
`+n` references to tile tables that are not drawn), one arrow per direction labelled with the number of
foreign keys between the two modules. Clicking an arrow lists its relations; clicking one opens it in the
table view. Tables without a module form the box "(no module)". The module filter buttons hide modules in both
views. The module view shows schema (foreign-key) coupling only: calls, events or jobs between modules do not
appear.

`dependsOn` turns on layer rules. Once any module declares it, an arrow is red when

- it lies on a cycle between modules (the modules reference each other, directly or around a loop), or
- its source module declares `dependsOn` and the target is not reachable through it (transitively:
  `billing -> ordering -> catalog` allows `billing` to reference `catalog`).

A module without `dependsOn` is not judged (only cycles are marked); `"dependsOn": []` forbids every outgoing
arrow. Arrows from or to "(no module)" are never judged. Without any `dependsOn` nothing is red. `build`
rejects `dependsOn` entries that name unknown modules or form a cycle.

## layout.json

Positions are kept apart from the model, so regenerating a model never wipes them.

```json
{ "version": 1, "current": { "Order": [60, 80] }, "target": { "Order": [60, 80] }, "groups": [{ "id": "g1", "name": "Ordering", "members": ["Order", "OrderLine"] }] }
```

- Keys are entity ids; values are `[x, y]` in page coordinates.
- Tables without a position are placed automatically.
- `groups` are named frames around tables.
- In the page, **More -> Export layout** downloads the current arrangement as a file you can pass to `--layout`.
