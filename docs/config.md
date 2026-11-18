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
  "tileTables": ["Edition"],
  "dataKinds": { "catalog": { "label": "Catalog", "color": "#0060a3", "description": "long-lived" }, "sales": { "label": "Sales" } },
  "entityKinds": { "Book": "catalog", "Order": "sales" },
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
| `tileTables` | Tables drawn as tiles by default; each viewer can change this for themselves |
| `dataKinds` | Data kinds with `label`, optional CSS `color` and optional `description` (tooltip of the filter button); their order is the zone order. Without a colour a palette colour is used. |
| `entityKinds` | Kind per table name; target tables inherit the kind of their origin. `"none"` is reserved for "no kind". |
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
as a tile table: its relations are drawn as small name tiles above the referencing tables instead.
`tileTables` sets the default; the toggle in the inspector is a per-browser preference.

## layout.json

Positions are kept apart from the model, so regenerating a model never wipes them.

```json
{ "version": 1, "current": { "Order": [60, 80] }, "target": { "Order": [60, 80] }, "groups": [{ "id": "g1", "name": "Ordering", "members": ["Order", "OrderLine"] }] }
```

- Keys are entity ids; values are `[x, y]` in page coordinates.
- Tables without a position are placed automatically.
- `groups` are named frames around tables.
- In the page, **More -> Export layout** downloads the current arrangement as a file you can pass to `--layout`.
