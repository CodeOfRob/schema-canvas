# Adapters

An adapter turns a schema source into a `model.json` object ([model-format.md](model-format.md)). Both
shipped adapters live in `src/adapters/` and only **map**; parsing and introspection are done by other tools.

## Prisma (`src/adapters/prisma.js`)

Uses the official parser, `getDMMF` from `@prisma/internals`, and maps its output. Connection settings
(`url`, `directUrl`, `shadowDatabaseUrl`) are removed before parsing, so schemas written for older Prisma
versions work too. `--prisma` takes a file or a directory of `.prisma` files.

Mapped: scalar and enum fields, lists, nullability, defaults, `@id` / `@@id`, `@unique`, `@@unique`,
`@@index`, relations (including self relations and implicit many-to-many), enums, `///` doc comments as notes.

Not shown: native types (`@db.VarChar(20)`; the Prisma type is used), `@map` / `@@map` names, views,
composite types.

## tbls (`src/adapters/tbls.js`)

Maps the JSON document of [tbls](https://github.com/k1LoW/tbls). tbls introspects the database, so every
database it supports works (PostgreSQL, MySQL, SQLite, ...).

```sh
tbls out -t json -o schema.json postgres://user:pass@host/db
schema-canvas model --tbls schema.json -o current.model.json
```

Mapped: base tables, columns, primary keys, unique constraints, indexes (including partial ones with
`WHERE`), foreign-key relations with cardinality, enums, comments. Tables of the current schema lose their
schema prefix (`public.books` -> `books`); other schemas keep it (`audit.events`).

Not shown: views and materialized views (skipped), check constraints, triggers.

## Writing a new adapter

1. Add `src/adapters/<name>.js` exporting a function `(source, name) => model` that returns a plain
   object in the model format. Do not validate yourself; the CLI runs `normalizeModel` on the result.
2. Import only from `src/model/` if you need shared helpers. Adapters must not import `src/viewer/`
   (enforced by `npm run lint:arch`).
3. Add a golden test: put a small invented source and its expected `model.json` into `test/fixtures/`
   and extend `test/adapters.test.js` (`UPDATE_GOLDEN=1 npm test` writes the expected file; review the diff).
4. Wire a CLI option in `bin/schema-canvas.mjs` (`options`, `modelFromSource`, usage text) and document it in
   [cli.md](cli.md).
