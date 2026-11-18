/** Architecture rules, checked by `npm run lint:arch`. */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", comment: "Circular dependencies make modules impossible to reason about in isolation.", from: {}, to: { circular: true } },
    { name: "viewer-isolated", severity: "error", comment: "The viewer runs in the browser; it may only share src/model.", from: { path: "^src/viewer/" }, to: { path: "^(src/adapters/|src/build/|bin/)" } },
    { name: "adapters-no-viewer", severity: "error", comment: "Adapters only produce model.json; they know nothing about the viewer.", from: { path: "^src/adapters/" }, to: { path: "^src/viewer/" } },
    { name: "model-is-leaf", severity: "error", comment: "src/model is the shared core and depends on nothing else in the repo.", from: { path: "^src/model/" }, to: { path: "^(src/viewer/|src/adapters/|src/build/|bin/)" } },
  ],
  options: { doNotFollow: { path: "node_modules" }, tsPreCompilationDeps: false },
};
