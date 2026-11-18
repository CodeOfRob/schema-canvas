# Contributing

schema-canvas is maintained as a personal project. **Issues and pull requests are not accepted** in this
repository. You are welcome to **fork it** and adapt it to your needs under the MIT license.

The notes below describe how to work on the code, for example in your fork.

## Setup

Requires Node.js 20 or newer (CI runs 22 and 24).

```sh
git clone https://github.com/CodeOfRob/schema-canvas.git
cd schema-canvas
npm install
npm run example     # builds examples/bookshop/out/page.html
```

## Checks

Run these after a change; CI runs the same:

```sh
npm run lint        # eslint
npm run lint:arch   # dependency-cruiser: no cycles, viewer / adapters / model boundaries
npm test            # node:test: adapter golden tests, diff, layout, storage sync, schema agreement
npm run example     # the example page must still build
npx knip            # unused files and exports
npx jscpd --ignore "**/node_modules/**,**/out/**,package-lock.json" .   # copy-paste detection
```

`UPDATE_GOLDEN=1 npm test` rewrites the adapter golden files after an intended change; review the diff.

## Guidelines

- Keep the module boundaries described in [docs/architecture.md](docs/architecture.md). `src/viewer/` runs in the
  browser and must not import adapters or build code.
- All UI text lives in `src/viewer/strings.js`; the HTML template carries only `data-s` keys.
- A new field in the model format touches `schema/model.schema.json`, `src/model/normalize.js` and usually the
  adapters, the diff and the inspector.
- Add a test for new behaviour. A new adapter needs a golden test (see [docs/adapters.md](docs/adapters.md)).
- Code, comments, file names and docs are English.

## Example and test data

Use **neutral, invented data only** (the bookshop and library fixtures are the model). Never commit schemas,
table names or notes from real systems, and never commit secrets.
