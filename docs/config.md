# config.json and layout.json

Both are optional side files passed to `build`. Unknown keys are rejected so typos do not go unnoticed.

## config.json

```json
{
  "title": "Bookshop schema",
  "storageKey": "bookshop-schema",
  "dbDocPath": "schema-canvas/state",
  "tileTables": ["Edition"],
  "dataKinds": { "catalog": { "label": "Catalog", "color": "#0060a3" }, "sales": { "label": "Sales" } },
  "entityKinds": { "Book": "catalog", "Order": "sales" },
  "notes": { "Inventory": "Shown in the table's details." }
}
```

| Key | Meaning |
|---|---|
| `title` | Page title (default: the model name) |
| `storageKey` | Prefix for browser storage (default: derived from the title or model name). Give pages that share an origin different keys. |
| `dbDocPath` | Document path in the shared artifact store, see [storage.md](storage.md) (default `schema-canvas/state`) |
| `tileTables` | Tables drawn as tiles by default; each viewer can change this for themselves |
| `dataKinds` | Data kinds with `label` and optional CSS `color`; their order is the zone order. Without a colour a palette colour is used. |
| `entityKinds` | Kind per table name; target tables inherit the kind of their origin. `"none"` is reserved for "no kind". |
| `notes` | Extra note per table name, shown in the inspector |

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
