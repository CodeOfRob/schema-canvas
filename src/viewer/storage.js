// Persistence behind one interface. A store is { kind, load(), save(snapshot), subscribe(onRemote, onError) | null }.
//   artifactDb   - shared document store of a Claude artifact host (window.claude.use("db")), live sync
//   localStorage - this browser only; other tabs of the same page sync through the "storage" event
//   file         - nothing is persisted automatically; the user exports / imports JSON files
// createSync() puts the conflict rule on top: a remote snapshot never silently replaces unsaved local edits.

const LOAD_TIMEOUT_MS = 10000;

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeLocal(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
export function readLocalJson(key, fallback) {
  const raw = readLocal(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);
}

export function createLocalStore(key) {
  return {
    kind: "localStorage",
    async load() { return readLocalJson(key, null); },
    async save(snapshot) {
      if (!writeLocal(key, JSON.stringify(snapshot))) throw Object.assign(new Error("localStorage is not writable"), { code: "local_unavailable" });
    },
    subscribe(onRemote, onError) {
      const listener = ev => {
        if (ev.key !== key || ev.newValue == null) return;
        try { onRemote(JSON.parse(ev.newValue)); } catch (error) { onError(error); }
      };
      window.addEventListener("storage", listener);
      return () => window.removeEventListener("storage", listener);
    },
  };
}

/** Returns null when the page does not run inside an artifact host that offers a db. */
async function createArtifactDbStore(docPath) {
  if (typeof window === "undefined" || !window.claude || typeof window.claude.use !== "function") return null;
  let db;
  // A host that refuses the db (no permission, not offered) means "no shared storage", not an error.
  try { db = await window.claude.use("db"); } catch (error) { console.warn("schema-canvas: shared storage refused, using this browser only", error); db = null; }
  if (!db) return null;
  const doc = db.doc(docPath);
  return {
    kind: "artifactDb",
    async load() {
      const snap = await withTimeout(doc.get(), LOAD_TIMEOUT_MS);
      return snap.exists ? snap.data() : null;
    },
    async save(snapshot) { await doc.set(snapshot); },
    subscribe(onRemote, onError) {
      return doc.onSnapshot(snap => {
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        if (snap.exists) onRemote(snap.data());
      }, onError);
    },
  };
}

function createFileStore() {
  return {
    kind: "file",
    async load() { return null; },
    async save() {},
    subscribe: null,
  };
}

function localStorageWorks() {
  const probe = "schema-canvas:probe";
  if (!writeLocal(probe, "1")) return false;
  try { localStorage.removeItem(probe); } catch { /* the write worked, removal failing is harmless */ }
  return true;
}

/** Picks the best available store: artifactDb, else localStorage, else file. */
export async function openStore({ docPath, localKey }) {
  const shared = await createArtifactDbStore(docPath);
  if (shared) return shared;
  return localStorageWorks() ? createLocalStore(localKey) : createFileStore();
}

function downloadViaBlobLink(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Returns the host's downloads capability, or null when the page runs outside an artifact host (or the host offers none). */
async function resolveDownloads(host) {
  if (!host || !host.claude || typeof host.claude.use !== "function") return null;
  try { return (await host.claude.use("downloads")) || null; } catch (error) { console.warn("schema-canvas: downloads capability refused, using a browser download", error); return null; }
}

/**
 * Saves a JSON document as a file. Inside a claude.ai artifact the host's `downloads` capability is used
 * (the artifact viewer blocks blob links); everywhere else a browser download.
 * Resolves with "artifact" or "browser"; rejects when the host declines the save (the caller reports it).
 * @param host object carrying an optional `claude.use` (the window; a fake in tests)
 */
export async function saveJsonFile(filename, data, host = typeof window === "undefined" ? null : window) {
  const text = JSON.stringify(data, null, 2) + "\n";
  const downloads = await resolveDownloads(host);
  if (!downloads) { downloadViaBlobLink(filename, text); return "browser"; }
  // shortcut: data is passed as a string; the real downloads API is untested locally, switch to a Blob if a host demands it.
  await downloads.save({ filename, data: text });
  return "artifact";
}

/** Opens a file picker and resolves with the parsed JSON of the chosen file (rejects on bad JSON). */
export function pickJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try { resolve({ name: file.name, data: JSON.parse(await file.text()) }); } catch (error) { reject(error); }
    });
    input.click();
  });
}

/**
 * Debounced saving plus the conflict rule.
 * @param o.store      primary store (see above)
 * @param o.cache      optional secondary store written on every save (localStorage behind a shared db)
 * @param o.snapshot   () => snapshot without savedAt
 * @param o.validate   raw => snapshot (throws when invalid)
 * @param o.adopt      snapshot => void, replaces the local state
 * @param o.onConflict (snapshot, { keepMine, takeTheirs }) => void
 * @param o.onStatus   (status, detail) => void
 * @param o.isBusy     () => boolean, true while the user drags (remote snapshots wait)
 */
export function createSync({ store, cache = null, snapshot, validate, adopt, onConflict, onStatus, isBusy = () => false, delayMs = 900 }) {
  let editGen = 0, savedGen = 0, lastSavedAt = null, saving = false, pending = false, timer = null, deferred = null;
  const ownSaves = new Set();

  async function save() {
    clearTimeout(timer);
    let payload;
    try {
      payload = validate({ ...snapshot(), savedAt: new Date().toISOString() });
    } catch (error) {
      onStatus("save-invalid", { error });
      return;
    }
    const gen = editGen;
    lastSavedAt = payload.savedAt;
    ownSaves.add(payload.savedAt);
    if (cache) await cache.save(payload).catch(error => onStatus("cache-failed", { error }));
    if (saving) { pending = true; return; }
    saving = true;
    try {
      await store.save(payload);
      if (gen > savedGen) savedGen = gen;
      onStatus("saved", { kind: store.kind, savedAt: payload.savedAt });
    } catch (error) {
      onStatus("save-failed", { error, kind: store.kind });
    } finally {
      saving = false;
      if (pending) { pending = false; save(); }
    }
  }

  function takeTheirs(payload) {
    clearTimeout(timer);
    savedGen = editGen;
    pending = false;
    lastSavedAt = payload.savedAt;
    adopt(payload);
    if (cache) cache.save(payload).catch(error => onStatus("cache-failed", { error }));
    onStatus("adopted", { savedAt: payload.savedAt });
  }

  function receive(raw) {
    let payload;
    try { payload = validate(raw); } catch (error) { onStatus("remote-invalid", { error }); return; }
    if (payload.savedAt === lastSavedAt || ownSaves.has(payload.savedAt)) return;
    if (isBusy()) {
      deferred = payload;
      setTimeout(() => { const next = deferred; deferred = null; if (next) receive(next); }, 400);
      return;
    }
    if (editGen !== savedGen) {
      onConflict(payload, { keepMine: () => save(), takeTheirs: () => takeTheirs(payload) });
      onStatus("conflict", { savedAt: payload.savedAt });
      return;
    }
    takeTheirs(payload);
  }

  return {
    get dirty() { return editGen !== savedGen; },
    schedule() {
      editGen++;
      clearTimeout(timer);
      onStatus("unsaved");
      timer = setTimeout(save, delayMs);
    },
    saveNow: save,
    receive,
    /** Subscribes to remote snapshots; errors are reported, never swallowed. */
    start() {
      if (!store.subscribe) return null;
      return store.subscribe(receive, error => onStatus("subscription-error", { error }));
    },
    /** Marks a loaded snapshot as the saved baseline (it came from storage, so nothing is unsaved). */
    markLoaded(savedAt) { lastSavedAt = savedAt; savedGen = editGen; },
  };
}
