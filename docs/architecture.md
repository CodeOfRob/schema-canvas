# Architecture

## Data flow

```
Prisma schema ─┐
               ├─ adapter ─► model.json ─┐
tbls JSON ─────┘                          ├─ bin/schema-canvas.mjs ─► buildPage() ─► page.html
target.model.json, layout.json, config.json ┘   (validate, warn)      (esbuild)
                                                                            │
                                                         browser: main.js reads window data, renders, saves
```

1. The **CLI** (`bin/schema-canvas.mjs`) reads the source, runs an adapter, validates every input with
   `src/model/` and reports unresolved origins.
2. **`src/build/page.js`** bundles `src/viewer/main.js` with esbuild (IIFE), inlines script, stylesheet and the
   validated data (as `window.__SCHEMA_CANVAS__` JSON) into `src/viewer/template.html`. Output: one HTML file.
3. In the **browser**, `main.js` validates the data again with the same `src/model/` code, computes the diff,
   renders the canvas, inspector and toolbar, and wires persistence ([storage.md](storage.md)).

## Module map

| Path | Role |
|---|---|
| `bin/schema-canvas.mjs` | CLI: argument parsing, file IO, calling adapters and the page builder |
| `src/model/normalize.js` | Validation and normalisation of `model.json`; shared by CLI and viewer |
| `src/model/page-data.js` | Validation of `config.json` and `layout.json` |
| `src/adapters/` | Prisma and tbls mapping to the model (no viewer knowledge) |
| `src/build/page.js` | esbuild bundle + template + data -> HTML |
| `src/viewer/main.js` | Browser entry point |
| `src/viewer/model.js` | Loads and validates page data and saved snapshots |
| `src/viewer/diff.js` | Current vs. target diff from `origin` references |
| `src/viewer/layout.js` | Automatic layouts (stress layout by relations, by data kind), overlap removal, the shared layout score |
| `src/viewer/layout-radial.js` | Star layout around one table |
| `src/viewer/layout-layered.js` | Layered module layout from `dependsOn` (foundation at the bottom) |
| `src/viewer/layout-force.js` | Force layout: springs, repulsion, collision, module clusters; one `forceTick` step for the static and the animated run |
| `src/viewer/classify.js` | One resolver for the classification axes (data kind, module) |
| `src/viewer/line-visibility.js` | Which relation lines the legend switches hide (drawing only), incl. the stored preference |
| `src/viewer/tiles.js` | The tile rule: which relations are no line (tile or badge), per-viewer tile preference |
| `src/viewer/module-graph.js` | Module view as data: nodes, edges with foreign-key counts, layer-rule violations |
| `src/viewer/geometry.js` | Box geometry shared by the table canvas, the module view and the layouts (box/centre conversion, moving a layout to its origin) |
| `src/viewer/markdown.js` | Safe markdown subset for the config texts |
| `src/viewer/storage.js` | Stores and the sync / conflict rule (`createSync`) |
| `src/viewer/snapshot-base.js` | Fingerprint of the built-in target and the load decision for saved snapshots |
| `src/viewer/strings.js` | All UI texts; the template carries only `data-s` keys; overrides from `config.strings` |
| `src/viewer/ui/state.js` | The single mutable UI state and preferences |
| `src/viewer/ui/actions.js` | All edits; every change goes through `commit()` (undo + save) |
| `src/viewer/ui/canvas.js` | Tables, links, zones, pan / zoom |
| `src/viewer/ui/inspector.js` | Detail panel |
| `src/viewer/ui/toolbar.js` | Toolbar, menus, import / export |
| `src/viewer/ui/module-view.js` | Module view on the canvas and its inspector panels |
| `src/viewer/ui/arrange-animation.js` | Plays an arrangement frame by frame, then applies it with one commit; click or key skips |
| `src/viewer/ui/sections.js` | Description and text sections from the config |
| `src/viewer/ui/persistence.js` | Connects state to storage, the conflict dialog and the saved-state question |
| `src/viewer/ui/view.js` | Late-bound render functions that keep the UI import graph acyclic |
| `schema/model.schema.json` | JSON Schema of `model.json` for editors |

## Boundaries

Checked by `npm run lint:arch` (dependency-cruiser, `.dependency-cruiser.cjs`):

- No circular dependencies.
- `src/viewer/` may import only `src/model/` from the rest of the repo (it runs in the browser).
- `src/adapters/` must not import `src/viewer/`.
- `src/model/` is the shared core and depends on nothing else.

The UI modules call each other (an edit re-renders canvas, panel and chrome; the canvas triggers edits).
`ui/view.js` holds these render and viewport functions behind a registry that `main.js` binds once, so the
modules stay independent of one another.
