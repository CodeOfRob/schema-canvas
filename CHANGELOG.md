# Changelog

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
