import { test } from "node:test";
import assert from "node:assert/strict";
import { saveJsonFile } from "../src/viewer/storage.js";

function fakeHost(use) { return { claude: { use } }; }

test("saves through the downloads capability when the host offers it", async () => {
  const saved = [];
  const host = fakeHost(async name => (name === "downloads" ? { save: async arg => { saved.push(arg); } } : null));
  assert.equal(await saveJsonFile("a.json", { x: 1 }, host), "artifact");
  assert.deepEqual(saved, [{ filename: "a.json", data: '{\n  "x": 1\n}\n' }]);
});

test("a declined save rejects so the caller can report it", async () => {
  const host = fakeHost(async () => ({ save: async () => { throw new Error("declined"); } }));
  await assert.rejects(saveJsonFile("a.json", {}, host), /declined/);
});

test("falls back to the browser download when the capability is null, absent or refused", async () => {
  const clicks = [];
  globalThis.document = {
    createElement: () => ({ click() { clicks.push(this.download); } , remove() {} }),
    body: { appendChild() {} },
  };
  try {
    const hosts = [fakeHost(async () => null), {}, null, { claude: {} }, fakeHost(async () => { throw new Error("no"); })];
    for (const host of hosts) assert.equal(await saveJsonFile("a.json", {}, host), "browser");
    assert.equal(clicks.length, hosts.length);
  } finally {
    delete globalThis.document;
  }
});
