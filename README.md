# schema-canvas

Turn a database schema into **one self-contained, interactive HTML page**: an ER diagram you can pan,
zoom and rearrange, with an optional **current vs. target** comparison and an in-browser editor for the
target model.

```
Prisma schema ─┐
               ├─► model.json ─► schema-canvas build ─► page.html (no server, no CDN, works offline)
tbls JSON ─────┘    (+ target.model.json, layout.json, config.json)
```

What you get in the page:

- **Diff colouring** between the current and a target model: new, removed, renamed, merged, moved and
  changed tables and fields; added, removed and changed relations.
- **Editing the target model**: rename tables and fields (double-click), add tables, fields, relations and
  groups, edit types, keys, defaults, notes, data kinds and origins, move fields between tables, undo.
- **Data kinds**: colour tables by kind (e.g. "catalog" vs. "sales"), draw background zones per kind,
  hide kinds via filter buttons.
- **Two automatic layouts**: by relations (stress layout, few crossings, few lines under tables) and by data kind.
- **Tile mode** per table: relations to a busy table (users, accounts, ...) are drawn as small name tiles
  above the referencing tables instead of long lines.
- Index display, enum list, inspector for tables, fields and relations, lasso multi-select, full screen,
  keyboard panning, light and dark theme.

Without a target model the page is a pure viewer (no diff, no editing).

## Quick start

Requires Node.js 20 or newer.

```sh
npm install
npm run example        # builds examples/bookshop/out/page.html
open examples/bookshop/out/page.html
```

Your own schema:

```sh
# 1. schema -> model.json
npx schema-canvas model --prisma prisma/schema.prisma -o current.model.json
# or, for any database tbls supports (PostgreSQL, MySQL, SQLite, ...):
tbls out -t json -o schema.json postgres://...
npx schema-canvas model --tbls schema.json -o current.model.json

# 2. model.json -> page.html (viewer only)
npx schema-canvas build --current current.model.json -o page.html

# 3. with a target model, saved layout and configuration
npx schema-canvas build --current current.model.json --target target.model.json \
  --layout my.layout.json --config config.json -o page.html
```

`build` also accepts `--prisma` or `--tbls` directly instead of `--current`.

## CLI

```
schema-canvas model (--prisma <file|dir> | --tbls <schema.json>) [--name <name>] -o <model.json>
schema-canvas build (--current <model.json> | --prisma <file|dir> | --tbls <schema.json>)
                    [--target <target.model.json>] [--layout <layout.json>] [--config <config.json>]
                    -o <page.html>
```

| Option | Meaning |
|---|---|
| `--prisma` | Prisma schema file, or a directory of `.prisma` files (multi-file schema) |
| `--tbls` | JSON written by `tbls out -t json` |
| `--current` | model.json of the current state |
| `--target` | model.json of the target state; enables the diff view and the editor |
| `--layout` | layout.json with table positions |
| `--config` | config.json (see below) |
| `--name` | model name stored in model.json |

Every input is validated; an invalid file stops the CLI with a list of all problems. Origins in the
target model that point to nothing in the current model are reported as warnings.

## Adapters

- **Prisma** uses the official parser (`getDMMF` from `@prisma/internals`) and only maps its output.
  Connection settings (`url`, `directUrl`, `shadowDatabaseUrl`) are removed before parsing, so schemas
  written for older Prisma versions work too. Mapped: scalar and enum fields, lists, nullability,
  defaults, `@id` / `@@id`, `@unique`, `@@unique`, `@@index`, relations (including self relations and
  implicit many-to-many), enums, and `///` doc comments as notes.
- **tbls** maps the JSON document of [tbls](https://github.com/k1LoW/tbls) (`tbls out -t json`). tbls
  does the database introspection, so every database it supports works. Mapped: base tables (views are
  skipped), columns, primary keys, unique constraints, indexes (including partial ones with `WHERE`),
  foreign-key relations with cardinality, enums, comments. Tables of the current schema lose their
  schema prefix (`public.books` → `books`); other schemas keep it (`audit.events`).

## model.json

Described by [`schema/model.schema.json`](schema/model.schema.json) (JSON Schema 2020-12; add
`"$schema"` to get editor completion).

```jsonc
{
  "version": 1,
  "name": "bookshop",
  "entities": [
    {
      "id": "Account",              // optional, defaults to name; relations and indexes refer to it
      "name": "Account",
      "kind": "sales",              // optional data kind (a key of config.dataKinds)
      "note": "free text",
      "origin": ["Customer"],       // target only: current entities this one continues (2+ = merged)
      "fields": [
        {
          "name": "displayName",
          "type": "String",
          "nullable": false,
          "list": false, "pk": false, "uk": false, "fk": false,   // optional flags
          "default": "now()",                                      // optional, source text
          "note": "free text",
          "origin": ["Customer.fullName"]                          // target only: "Entity.field" refs
        }
      ]
    }
  ],
  "relations": [
    {
      "from": "Order", "to": "Account",            // from = the referencing side
      "fromFields": ["accountId"], "toFields": ["id"],
      "cardinality": { "from": "n", "to": "1" },   // "1" | "0..1" | "n"
      "label": "optional"                          // defaults to the from fields
    }
  ],
  "indexes": [{ "entity": "Order", "name": "optional", "fields": ["accountId", "placedAt"], "unique": false, "where": "optional predicate" }],
  "enums": [{ "name": "OrderStatus", "values": ["OPEN", "PAID"] }]
}
```

### How the diff works

The target model states where its parts come from; nothing is guessed from names or comments.

- `entity.origin`: names of current entities this target entity continues. One different name =
  renamed, two or more = merged, `[]` = new.
- `field.origin`: `"Entity.field"` references into the current model. Another name = renamed, a field
  of an entity outside `entity.origin` = moved, `[]` = new. A changed type, list, nullability, key flag
  or default marks the field as changed.
- **Implicit origin**: when `origin` is absent, a same-named entity (or field of an origin entity)
  counts as the origin, so unchanged parts need no bookkeeping.
- Current parts no target part claims are removed. Relations are compared by their endpoints and
  foreign-key fields after mapping current names to their successors; a different cardinality marks a
  relation as changed.

Entity names may contain dots (`audit.events`); field references split at the last dot.

## layout.json

Positions are kept apart from the model, so regenerating a model never wipes them:

```json
{ "version": 1, "current": { "Order": [60, 80] }, "target": { "Order": [60, 80] }, "groups": [{ "id": "g1", "name": "Ordering", "members": ["Order", "OrderLine"] }] }
```

Keys are entity ids. Tables without a position are placed automatically. In the page,
**More → Export layout** downloads the current arrangement as a file you can pass to `--layout`.

## config.json

All keys are optional.

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
| `storageKey` | Prefix for browser storage (default: derived from the title or model name) |
| `dbDocPath` | Document path in the shared artifact store (see storage) |
| `tileTables` | Tables drawn as tiles by default; each viewer can change this for themselves |
| `dataKinds` | Data kinds with label and optional CSS colour; their order is the zone order |
| `entityKinds` | Kind per table name; target tables inherit the kind of their origin. `"none"` is reserved for "no kind" |
| `notes` | Extra note per table name, shown in the inspector |

## Storage modes

Edits of the target model and the layout are saved automatically through one of three stores:

1. **Shared artifact store**, when the page runs inside a host that offers `window.claude.use("db")`
   (e.g. a Claude artifact). Everyone with the page sees the same state, live.
2. **localStorage** of this browser, otherwise. Other tabs of the same page stay in sync.
3. **File** only, when the browser blocks storage. Use **More → Export / Import**.

Export and import of the target model and the layout as JSON files work in every mode.

If a newer state arrives from elsewhere while you have unsaved edits, the page asks **keep mine / take
theirs** instead of dropping either. Saved states that do not validate are ignored with a message.
Viewer preferences (tile tables, hidden kinds, index display, zone distance) stay in this browser.

## Limitations

- Prisma: native database types (`@db.VarChar(20)`), `@map` / `@@map` names, views and composite types
  are not shown; the Prisma type is used.
- tbls: views and materialized views are skipped; check constraints and triggers are not shown.
- The relation layout compares every pair of tables; beyond a few hundred tables it gets slow.
- The page renders all tables as DOM elements; very large schemas (1000+ tables) will feel heavy.
- No collaborative merging: the conflict dialog picks one whole state.

## Development

```sh
npm test              # node:test - adapter golden tests, diff, layout, storage sync, schema agreement
npm run lint          # eslint
UPDATE_GOLDEN=1 npm test   # rewrite the adapter golden files after an intended change (review the diff!)
```

Code map: `src/adapters/` (Prisma, tbls), `src/model/` (validation of model, config and layout),
`src/viewer/` (diff, layout, storage, strings, UI modules, template and styles), `src/build/` (bundles the
viewer with esbuild into one HTML page), `bin/` (CLI).

## License

MIT, see [LICENSE](LICENSE).
