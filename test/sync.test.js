import { test } from "node:test";
import assert from "node:assert/strict";
import { createSync } from "../src/viewer/storage.js";

function harness({ failSave = false } = {}) {
  const events = { adopted: [], conflicts: [], statuses: [], saved: [] };
  let remoteListener = null, errorListener = null;
  const store = {
    kind: "fake",
    async save(payload) { if (failSave) throw new Error("disk full"); events.saved.push(payload); },
    subscribe(onRemote, onError) { remoteListener = onRemote; errorListener = onError; return () => {}; },
  };
  let local = { value: 1 };
  const sync = createSync({
    store,
    snapshot: () => ({ format: "t", ...local }),
    validate: raw => { if (!raw || raw.format !== "t") throw new Error("bad"); return raw; },
    adopt: payload => { events.adopted.push(payload); local = { value: payload.value }; },
    onConflict: (payload, choice) => events.conflicts.push({ payload, choice }),
    onStatus: (status, detail) => events.statuses.push([status, detail]),
    delayMs: 5,
  });
  sync.start();
  return { sync, events, remote: raw => remoteListener(raw), failSubscription: e => errorListener(e), edit: v => { local = { value: v }; sync.schedule(); } };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test("a remote snapshot is adopted when there are no local edits", () => {
  const h = harness();
  h.remote({ format: "t", value: 7, savedAt: "2026-01-01T00:00:00Z" });
  assert.equal(h.events.adopted.length, 1);
  assert.equal(h.events.conflicts.length, 0);
});

test("a remote snapshot during unsaved edits asks instead of dropping them", () => {
  const h = harness();
  h.edit(2);
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:01Z" });
  assert.equal(h.events.adopted.length, 0, "local edits must not be replaced silently");
  assert.equal(h.events.conflicts.length, 1);
  h.events.conflicts[0].choice.takeTheirs();
  assert.equal(h.events.adopted.length, 1);
});

test("keep mine saves the local state over the remote one", async () => {
  const h = harness();
  h.edit(3);
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:02Z" });
  await h.events.conflicts[0].choice.keepMine();
  assert.equal(h.events.saved.at(-1).value, 3);
  assert.equal(h.sync.dirty, false);
});

test("the echo of an own save is ignored", async () => {
  const h = harness();
  h.edit(4);
  await wait(20);
  const own = h.events.saved.at(-1);
  h.remote(own);
  assert.equal(h.events.adopted.length, 0);
  assert.equal(h.events.conflicts.length, 0);
});

test("invalid remote snapshots and subscription errors are reported", () => {
  const h = harness();
  h.remote({ format: "other" });
  h.failSubscription(new Error("offline"));
  const statuses = h.events.statuses.map(([s]) => s);
  assert.ok(statuses.includes("remote-invalid"));
  assert.ok(statuses.includes("subscription-error"));
  assert.equal(h.events.adopted.length, 0);
});

test("a failing save is reported and the edits stay unsaved", async () => {
  const h = harness({ failSave: true });
  h.edit(5);
  await wait(20);
  assert.ok(h.events.statuses.some(([s]) => s === "save-failed"));
  assert.equal(h.sync.dirty, true);
});

test("while paused nothing is saved, not even the cache; after resume the edits are saved", async () => {
  const cached = [];
  const saved = [];
  let local = { value: 1 };
  const sync = createSync({
    store: { kind: "fake", async save(payload) { saved.push(payload); }, subscribe: null },
    cache: { async save(payload) { cached.push(payload); } },
    snapshot: () => ({ format: "t", ...local }),
    validate: raw => raw,
    adopt: () => {},
    onConflict: () => {},
    onStatus: () => {},
    delayMs: 5,
  });
  sync.pause();
  local = { value: 2 };
  sync.schedule();
  await wait(20);
  await sync.saveNow();
  assert.equal(saved.length + cached.length, 0, "a paused sync must not write anywhere");
  assert.equal(sync.dirty, true);
  sync.resume();
  await sync.saveNow();
  assert.equal(saved.at(-1).value, 2);
  assert.equal(cached.at(-1).value, 2);
  assert.equal(sync.dirty, false);
});
