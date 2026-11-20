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
| `modules` | Modules with `label`, optional CSS `color`, `description`, `dependsOn` (keys of modules it may reference) and `transitive` (boolean, needs `dependsOn`, default `true`); their order is the box and filter order |
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

### Line switches in the legend

Each legend entry that stands for a kind of relation line is a switch: **new**, **changed**, **removed**,
**unchanged** (the diff status of the relation in the shown tab, so only with a target model) and **reference
without foreign key** (opaque). Click it, or focus it and press Enter or Space, to hide or show those lines; a hidden
entry is dimmed and struck through. A relation hides when its status or, being opaque, the opaque entry is off.
Its tile or badge hides with its line. "renamed / moved / merged" describes tables and fields only and is no switch.

- Drawing only: no table moves, the arrangements ignore it, and counts, the inspector and exports are unchanged.
  A selected relation that gets hidden is deselected.
- The module view draws no relation lines; there the diff entries are inert and the opaque entry hides the dashed
  arrows.
- The legend says how many relations are hidden in the shown view.
- The choice is a viewer preference kept in this browser, like the other ones ([storage.md](storage.md)).

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
`+n` references to tile tables that are not drawn while they follow the rules), one arrow per direction labelled with the number of
foreign keys between the two modules. Clicking an arrow lists its relations; clicking one opens it in the
table view. Tables without a module form the box "(no module)". The module filter buttons hide modules in both
views. The module view shows schema (foreign-key) coupling only: calls, events or jobs between modules do not
appear.

In the table view every table with a module carries a small tag on the top edge of its box with the module's label,
and the header shows a **Modules** legend (colour + label, in the order of `modules`). Tag, legend, module boxes and
filter buttons use the same colour per module: its `color`, else the built-in palette by position. Tables without a
module carry no tag; a page without `modules` shows neither tags nor the legend. Tags only draw: box sizes, layouts
and counts stay the same. The module view shows no tags and no legend (its boxes are the modules).

A page with both `dataKinds` and `modules` adds **Colour tables by** to the legend: **Data kind** (the default) or
**Module** decides what the coloured left edge of each table shows, with the colour of that data kind or module. A table
without a module has a plain edge in module mode. The legend shows the data-kind colours next to the choice while tables
are coloured by data kind; the module colours are in the **Modules** section. The choice is saved per browser and only
draws: the data-kind filter keeps filtering by data kind, the data-kind zones stay, the diff colours keep the other
edges, and layouts, counts and exports do not change. A page with only one of the two keeps today's colouring and shows
no choice.

**Areas** in that legend (off by default, saved per browser) draws a soft area in the module's colour behind the tables
of each module: the rounded outline around tables that lie at most 120 px apart, so a module whose tables are spread out
gets several areas. It is drawn behind tables, zones and lines, never takes a click, follows dragged tables and
arrangement animations, and changes nothing else. Exports are JSON (model and layout) and never contain tags or areas.

`dependsOn` turns on layer rules. Once any module declares it, an arrow is red when

- it lies on a cycle between modules (the modules reference each other, directly or around a loop), or
- its source module declares `dependsOn` and the target is not reachable through it (transitively:
  `billing -> ordering -> catalog` allows `billing` to reference `catalog`).

`"transitive": false` on a module narrows that to its direct `dependsOn` entries (and itself): with
`billing: { "dependsOn": ["ordering"], "transitive": false }` a reference from `billing` to `catalog` is red even
though `ordering` depends on `catalog`. It only restricts the module it is set on; other modules still reach
through it. The inspector of such a module says "only direct dependencies". `transitive` without `dependsOn` is
rejected.

A module without `dependsOn` is not judged (only cycles are marked); `"dependsOn": []` forbids every outgoing
arrow. Arrows from or to "(no module)" are never judged. Without any `dependsOn` nothing is red. `build`
rejects `dependsOn` entries that name unknown modules or form a cycle.

References to **tile tables** (tile or badge display) take part in the check like any other: one that follows the
rules stays hidden (counted as `+n` on the box), one that breaks them is drawn as a red arrow, and the arrow's
inspector lists it.

**Opaque references** (`"opaque": true` on a relation, see [model-format.md](model-format.md)) have no foreign key.
They get their own dashed grey arrow, are never red (an opaque reference upward is allowed by design), do not take part
in cycle detection and are not counted as foreign keys inside a module.

The legend entry **reference without foreign key** (shown only when a model has any) hides them in both views; see
[Line switches in the legend](#line-switches-in-the-legend). Red arrows are never opaque, so nothing red can be hidden.

#### Arrangement of the module view

Without any `dependsOn` the boxes are placed by their foreign keys (related modules close together). Once any module
declares `dependsOn`, the boxes are arranged in **layers**, the foundation at the bottom:

- every module sits above everything it depends on, and as high as that allows: a module nothing depends on goes to
  the top layer (even with a short path down), any other one directly below its highest dependent;
  `"dependsOn": []` keeps a module on the bottom layer;
- a module without `dependsOn` falls back to its foreign-key arrows (opaque ones never count); if those form a cycle,
  the arrow that would close it is ignored for the arrangement, keeping declared `dependsOn` and the module earlier in
  `modules`;
- inside a layer the order follows the arrows to reduce crossings, otherwise the order of `modules`;
- a layer wider than a balanced grid of all modules wraps into staggered sub-rows;
- "(no module)" is not part of any layer: it sits to the right, so tables with or without a module do not move the
  other boxes. With every module declared, the arrangement depends on the configuration alone, so both tabs show
  the modules in the same places.

Dragged positions (`modules` in layout.json) always win; **Arrange** in the module view forgets them and shows the
derived arrangement again.

#### Arrange as a star

**View -> Arrange as a star** puts a hub in the middle, its neighbours on a ring around it and every further
relation step one ring further out, each branch in its own part of the circle. Each ring is a circle only as large as
its tables need side by side. Separate small groups and tables without relations go in rows below the star, as wide
as the star: the groups first (biggest first), then the single tables.

The centre is always a hub: the 10 % of tables in the biggest group with the most relations (at least 3, and every
table tying with the last one). Each hub is tried as the centre and the layout with the lowest score wins: crossings
plus lines under tables, then mean line length and area as smaller terms (weights in `ARRANGEMENT_WEIGHTS`,
`src/viewer/layout.js`). Equal scores go to the table whose id sorts first. The selection plays no part, and separate
small groups take their most central table (ties: smallest id), so the same model always gives the same star. On 130
tables this takes about 0.1 s. Bigger models with many hubs try fewer of them, the most central first, so the wait
stays near half a second (500 tables: 8 centres); the number depends on the model's size only, never on the machine.

#### Modules in the table view: Arrange by forces

**View -> Arrange by forces** arranges the tables like a graph view: every relation is a spring (a foreign key pulls
harder than an opaque reference), all tables push each other apart, and the tables of one module are pulled towards
the module's centre, so each module becomes an island. Tables without a module feel no such pull; tables without any
relation and module are held near the middle. Relations to tile tables do not pull, hidden opaque references do
(hiding is drawing only), and in the editor the members of a group pull together. The run starts from the current
positions, so a second click refines the first. It is animated for two seconds (a click or key press skips to the
result, which is the same either way; with "reduce motion" set in the system it is applied at once) and is one undo
step.

**Spacing** next to it (0.5x to 2.5x, default 1.0x) sets the distance between the tables: it scales the repulsion
together with the rest length of the springs and the minimum gap (50 px at 1.0x, 100 px at 2.0x). While the shown
layout is the result of the last force run, moving the slider re-arranges it live from that run's start positions,
so a value always gives the same layout and moving back restores the earlier one; letting go is one undo step.
Otherwise (another arrangement, a moved table, any edit) the slider is greyed and only sets the factor for the next
**Arrange by forces**. The factor is a viewer preference kept in this browser.

## layout.json

Positions are kept apart from the model, so regenerating a model never wipes them.

```json
{ "version": 1, "current": { "Order": [60, 80] }, "target": { "Order": [60, 80] }, "groups": [{ "id": "g1", "name": "Ordering", "members": ["Order", "OrderLine"] }] }
```

- Keys are entity ids; values are `[x, y]` in page coordinates.
- Tables without a position are placed automatically.
- `groups` are named frames around tables.
- `modules` (optional) holds the positions of the module boxes in the module view, `{ "<module key>": [x, y] }`, one map for
  both tabs. Dragging a box saves all shown positions; modules without one are arranged automatically. **Arrange** in the
  module view clears the map. Keys of modules that are not shown are kept.
- In the page, **More -> Export layout** downloads the current arrangement as a file you can pass to `--layout`.
