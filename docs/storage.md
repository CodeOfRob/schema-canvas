# Storage

Edits of the target model and the layout are saved automatically through one of three stores. The page
picks the best available one at start.

| Order | Store | When | Scope |
|---|---|---|---|
| 1 | **Shared artifact store** | the host offers `window.claude.use("db")` (a claude.ai artifact) | everyone with the page, live |
| 2 | **localStorage** | otherwise | this browser; other tabs of the same page stay in sync via the `storage` event |
| 3 | **File** | the browser blocks storage | nothing is saved automatically |

Export and import of the target model and the layout as JSON files (**More** menu) work in every mode.
A host that refuses the shared store is treated as "not available", not as an error.

Inside a claude.ai artifact the viewer blocks blob-link downloads, so export uses the host's `downloads`
capability (`window.claude.use("downloads")`, then `save({ filename, data })` with the JSON text). When the
capability is absent or null, the normal browser download is used. If the host declines a save, the page shows
a short message and nothing else happens. The selection logic is `saveJsonFile` in `src/viewer/storage.js`,
covered by `test/export.test.js`.

When hosting as a claude.ai artifact, declare the capabilities `db` (shared storage) and `downloads` (file export).

Keys: the localStorage key and the artifact document path come from `storageKey` and `dbDocPath` in
[config.md](config.md). Viewer preferences (tile tables, hidden kinds, hidden line types, index display, dimming of reviewed tables, zone distance)
always stay in this browser.

## Snapshot format

What is saved (and what other tabs / the shared store exchange):

```json
{ "format": "schema-canvas/state", "base": "tt9m78ykgj", "target": { "...": "a model.json" }, "layout": { "...": "a layout.json" }, "savedAt": "2026-01-01T12:00:00.000Z" }
```

`target` is `null` for pages built without a target model. Snapshots are validated on load; one that does
not validate is ignored with a message.

`base` is the fingerprint of the built-in target model the saved state was based on: a 53-bit hash of the
normalized target as embedded in the page, with object keys sorted (computed once at page start; `null` for a
page without a target model). Snapshots saved before this field existed have no `base` and count as based on an
unknown older version.

## A new page version with a changed built-in target

When a page is rebuilt with a changed target model, a viewer may still have a state saved against the old one
(in this browser or in the shared store). Such a state is never applied silently. At page start:

- `base` equals the page's fingerprint, or the saved target is identical to the built-in one, or the page has
  no target model: the saved state is applied as before.
- Otherwise the page shows its built-in target and asks, with the date of the saved state:
  - **Use the page's version**: the saved target and layout are dropped; the built-in ones stay.
  - **Keep my saved state**: the saved target and layout are applied.

While the question is open nothing is saved, neither to the store nor to this browser's cache. Either answer is
a decision about this page version, so the resulting state is saved at once with the page's fingerprint as
`base`: the question does not come back on the next load. With the shared store this means the answer applies
to everyone, the same way the conflict dialog's choice does (the store holds one state for all). Edits made
while the question was open are kept by "use the page's version" and dropped by "keep my saved state".

With the shared store, the shared snapshot decides; this browser's cached copy is only asked about when the
shared store is empty or unreachable. A snapshot that arrives live from another tab or viewer keeps its `base`,
so a state from another page version is recognised again at the next load. The decision is
`decideSavedState` in `src/viewer/snapshot-base.js`, covered by `test/snapshot-base.test.js`.

## Conflict rule

Saving is debounced (about one second after the last edit). A snapshot that arrives from elsewhere is
never allowed to silently replace unsaved local edits:

- No unsaved local edits: the remote state is adopted.
- Unsaved local edits and a different remote state arrives: a dialog asks **keep mine** (save the local state over the
  remote one) or **take theirs** (drop local edits, adopt the remote state).
- The echo of your own save is ignored. A remote snapshot that arrives while you drag waits until you stop.
- A failing save is reported and the edits stay marked as unsaved.
- Live sync starts only after the question about a saved state from another page version (above) is answered.

There is no merging: the dialog picks one whole state. The logic lives in `createSync` in
`src/viewer/storage.js` and is covered by `test/sync.test.js`.
