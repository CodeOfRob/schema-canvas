import { test } from "node:test";
import assert from "node:assert/strict";
import { createSync } from "../src/viewer/storage.js";

/** A sync over a fake store holding { value }; records adoptions and conflicts. */
function syncOver(store, options = {}) {
  const events = { adopted: [], conflicts: [], statuses: [], saved: [] };
  let local = { value: 1 };
  const sync = createSync({
    store,
    snapshot: () => ({ format: "t", ...local }),
    validate: raw => { if (!raw || raw.format !== "t") throw new Error("bad"); return raw; },
    adopt: payload => { events.adopted.push(payload); local = { value: payload.value }; },
    onConflict: (payload, choice) => events.conflicts.push({ payload, choice }),
    onStatus: (status, detail) => events.statuses.push([status, detail]),
    delayMs: 5,
    ...options,
  });
  return { sync, events, local: () => local, edit: v => { local = { value: v }; sync.schedule(); } };
}

function harness({ failSave = false, ...options } = {}) {
  let remoteListener = null, errorListener = null, events = null;
  const store = {
    kind: "fake",
    async save(payload) { if (failSave) throw new Error("disk full"); events.saved.push(payload); },
    subscribe(onRemote, onError) { remoteListener = onRemote; errorListener = onError; return () => {}; },
  };
  const h = syncOver(store, options);
  events = h.events;
  h.sync.start();
  return { ...h, remote: raw => remoteListener(raw), failSubscription: e => errorListener(e) };
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

test("a remote snapshot waits while the user is busy (drag, arrangement animation) and then asks about the edit made meanwhile", async () => {
  let busy = true;
  // The real save delay (900 ms) is longer than the 400 ms re-check of a waiting snapshot; 2 s keeps that order here.
  const h = harness({ isBusy: () => busy, delayMs: 2000 });
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:05Z" });
  assert.equal(h.events.adopted.length, 0, "not drawn over a running gesture");
  // The gesture ends with its own edit (the animation's final positions), before the waiting snapshot is looked at again.
  h.edit(5);
  busy = false;
  await wait(450);
  assert.equal(h.events.adopted.length, 0, "the gesture's result is not replaced silently");
  assert.equal(h.events.conflicts.length, 1);
});

// ---------- a waiting remote snapshot against saves made meanwhile (fake timers, no wall clock) ----------
// The store holds one document; a remote snapshot that arrived before a local write began was overwritten by it.
function controlledHarness(t, { busy }) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const writes = [];
  let remoteListener = null, events = null;
  const store = {
    kind: "fake",
    save(payload) { return new Promise((resolve, reject) => writes.push(ok => { if (!ok) { reject(new Error("offline")); return; } events.saved.push(payload); resolve(); })); },
    subscribe(onRemote) { remoteListener = onRemote; return () => {}; },
  };
  const h = syncOver(store, { isBusy: () => busy.now, delayMs: 900 });
  events = h.events;
  h.sync.start();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    ...h,
    remote: raw => remoteListener(raw),
    /** Lets the store finish (or fail) the oldest running write. */
    finishWrite: async (ok = true) => { writes.shift()(ok); await flush(); },
    tick: async ms => { t.mock.timers.tick(ms); await flush(); },
  };
}

test("a waiting remote snapshot that a later local save overwrote is not adopted (the store holds the newer save)", async t => {
  const busy = { now: false };
  const h = controlledHarness(t, { busy });
  h.edit(5);
  busy.now = true; // e.g. a drag starts right after the edit
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:06Z" });
  await h.tick(900); // the debounced save of 5 starts after the remote arrived ...
  await h.finishWrite(); // ... and lands in the store over it
  busy.now = false; // the drag ends without moving anything: no new edit
  await h.tick(400);
  assert.equal(h.events.adopted.length, 0, "the older remote must not replace the newer saved state");
  assert.equal(h.events.conflicts.length, 0, "nothing to decide: the store already holds the local save");
  assert.equal(h.local().value, 5);
});

test("a waiting remote snapshot that arrived while a local save was being written asks (the order in the store is unknown)", async t => {
  const busy = { now: false };
  const h = controlledHarness(t, { busy });
  h.edit(5);
  await h.tick(900); // the save of 5 is being written
  busy.now = true;
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:07Z" });
  await h.finishWrite();
  busy.now = false;
  await h.tick(400);
  assert.equal(h.events.adopted.length, 0, "not adopted silently");
  assert.equal(h.events.conflicts.length, 1);
});

test("a waiting remote snapshot with no local write since it arrived is adopted as before", async t => {
  const busy = { now: true };
  const h = controlledHarness(t, { busy });
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:08Z" });
  busy.now = false;
  await h.tick(400);
  assert.equal(h.events.adopted.length, 1);
  assert.equal(h.local().value, 9);
});

test("a waiting remote snapshot that arrived during one write and was followed by another write is dropped", async t => {
  const busy = { now: false };
  const h = controlledHarness(t, { busy });
  h.edit(5);
  await h.tick(900); // W1 (5) is being written
  busy.now = true;
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:09Z" });
  h.edit(6);
  await h.finishWrite();
  await h.tick(900); // W2 (6) begins after the remote arrived ...
  await h.finishWrite(); // ... and the store keeps it
  busy.now = false;
  await h.tick(400);
  assert.equal(h.events.conflicts.length, 0, "the store holds W2; offering the older remote would show a stale state");
  assert.equal(h.events.adopted.length, 0);
  assert.equal(h.local().value, 6);
});

test("a waiting remote snapshot is not dropped for a later write that failed: the store still holds it, so the dialog asks", async t => {
  const busy = { now: true };
  const h = controlledHarness(t, { busy });
  h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:10Z" });
  h.edit(5);
  await h.tick(900); // the save of 5 begins after the remote arrived ...
  await h.finishWrite(false); // ... and fails
  busy.now = false;
  await h.tick(400);
  assert.equal(h.events.conflicts.length, 1, "unsaved edits against the state the store holds: ask");
  assert.equal(h.events.adopted.length, 0);
});

test("a waiting remote snapshot waits for a later write that is still running and is decided by its outcome", async t => {
  for (const ok of [true, false]) {
    const busy = { now: true };
    const h = controlledHarness(t, { busy });
    h.remote({ format: "t", value: 9, savedAt: "2026-01-01T00:00:11Z" });
    h.edit(5);
    await h.tick(900); // the save of 5 begins after the remote arrived
    busy.now = false;
    await h.tick(400); // still being written: nothing decided yet
    assert.equal(h.events.conflicts.length + h.events.adopted.length, 0);
    await h.finishWrite(ok);
    await h.tick(400);
    // Landed: the store holds the save, the remote is dropped. Failed: the store still holds the remote, so ask.
    assert.equal(h.events.conflicts.length, ok ? 0 : 1, ok ? "write landed" : "write failed");
    assert.equal(h.events.adopted.length, 0);
    t.mock.timers.reset();
  }
});
