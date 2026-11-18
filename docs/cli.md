# CLI

```
schema-canvas model (--prisma <file|dir> | --tbls <schema.json>) [--name <name>] -o <model.json>
schema-canvas build (--current <model.json> | --prisma <file|dir> | --tbls <schema.json>)
                    [--target <target.model.json>] [--layout <layout.json>] [--config <config.json>]
                    -o <page.html>
```

## Commands

- **`model`** reads a schema source and writes a validated `model.json`
  (see [model-format.md](model-format.md)). Prints the number of tables and relations.
- **`build`** produces the single HTML page. The current model comes from `--current`, or is generated
  on the fly from `--prisma` / `--tbls`. Exactly one of the three must be given.

## Options

| Option | Meaning |
|---|---|
| `--prisma` | Prisma schema file, or a directory of `.prisma` files (multi-file schema) |
| `--tbls` | JSON written by `tbls out -t json` |
| `--current` | `model.json` of the current state |
| `--target` | `model.json` of the target state; enables the diff view and the editor |
| `--layout` | `layout.json` with table positions (see [config.md](config.md)) |
| `--config` | `config.json` (see [config.md](config.md)) |
| `--name` | Model name stored in `model.json` (default: empty) |
| `-o`, `--out` | Output file; missing directories are created |
| `-h`, `--help` | Show usage |

## Behaviour

- Every input is validated; an invalid file stops the CLI with the list of all problems (exit code 1).
- Origins in the target model that point to nothing in the current model are printed as warnings.
- The page is fully self-contained (script, styles and data are inlined); it needs no server and no network.

## Running without installing

```sh
npx github:CodeOfRob/schema-canvas build --prisma prisma/schema.prisma -o schema.html
```

The first run installs the dependencies (the Prisma parser is the largest). The same invocation shape
works from a packed tarball: `npm pack`, then `npx ./schema-canvas-0.1.0.tgz build ...`.
