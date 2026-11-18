// Wires the storage interface to the viewer state: startup load, saving after each commit, conflict dialog.
import { STATE_FORMAT, parseSnapshot } from "../model.js";
import { createLocalStore, createSync, openStore, readLocalJson } from "../storage.js";
import { S } from "../strings.js";
import { onCommit, placeMissing, refresh } from "./actions.js";
import { flash } from "./toolbar.js";
import { state, entityById, hasTarget } from "./state.js";

const time = iso => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function applySnapshot(snapshot) {
  if (hasTarget()) state.target = snapshot.target;
  state.layout = snapshot.layout;
  placeMissing("current");
  placeMissing("target");
  state.undo = [];
  if (state.sel && state.sel.kind !== "rel" && !entityById(state.sel.eid || state.sel.id)) state.sel = null;
}

/** Applies the snapshot this browser saved last time, before anything renders. Returns its savedAt or null. */
export function applyLocalSnapshot() {
  const raw = readLocalJson(state.prefsKey + ":state", null);
  if (!raw) return null;
  try {
    const snapshot = parseSnapshot(raw, hasTarget());
    applySnapshot(snapshot);
    return snapshot.savedAt;
  } catch (error) {
    console.error("schema-canvas: ignoring the locally saved state", error);
    return null;
  }
}

function showConflict(snapshot, choice) {
  const dialog = document.getElementById("conflict");
  dialog.querySelector(".c-time").textContent = new Date(snapshot.savedAt).toLocaleTimeString();
  dialog.hidden = false;
  dialog.onclick = ev => {
    const button = ev.target.closest("[data-choice]");
    if (!button) return;
    dialog.hidden = true;
    dialog.onclick = null;
    if (button.dataset.choice === "theirs") choice.takeTheirs(); else choice.keepMine();
  };
}

function onStatus(status, detail = {}) {
  if (detail.error) console.error("schema-canvas: " + status, detail.error);
  const code = detail.error && detail.error.code;
  const messages = {
    unsaved: S.unsaved,
    saved: () => (detail.kind === "artifactDb" ? S.savedAt(time(detail.savedAt)) : detail.kind === "localStorage" ? S.savedLocal : S.savedNowhere),
    "save-failed": () => (code === "permission_denied" || code === "not_granted" ? S.saveDenied : detail.kind === "localStorage" ? S.savedNowhere : S.saveFailed),
    "save-invalid": () => S.saveInvalid(String(detail.error && detail.error.message).split("\n").slice(0, 2).join(" ")),
    "remote-invalid": S.remoteInvalid,
    "subscription-error": S.subscriptionError,
    adopted: S.adopted,
    conflict: S.conflictStatus,
  };
  const message = messages[status];
  if (message !== undefined) flash(typeof message === "function" ? message() : message);
}

export async function initPersistence(localSavedAt) {
  const localKey = state.prefsKey + ":state";
  const store = await openStore({ docPath: state.page.config.dbDocPath, localKey });
  const sync = createSync({
    store,
    cache: store.kind === "artifactDb" ? createLocalStore(localKey) : null,
    snapshot: () => ({ format: STATE_FORMAT, target: state.target, layout: state.layout }),
    validate: raw => parseSnapshot(raw, hasTarget()),
    adopt: snapshot => { applySnapshot(snapshot); refresh(); },
    onConflict: showConflict,
    onStatus,
    isBusy: () => state.dragging,
  });
  onCommit(() => sync.schedule());
  if (localSavedAt) sync.markLoaded(localSavedAt);
  if (store.kind === "artifactDb") {
    try {
      const raw = await store.load();
      if (raw && !sync.dirty) {
        const snapshot = parseSnapshot(raw, hasTarget());
        applySnapshot(snapshot);
        sync.markLoaded(snapshot.savedAt);
        refresh();
        flash(S.loadedShared);
      } else if (sync.dirty) {
        sync.saveNow();
      } else {
        flash(S.sharedEmpty);
      }
    } catch (error) {
      console.error("schema-canvas: shared state not loaded", error);
      flash(S.sharedUnreachable);
    }
  } else {
    flash(localSavedAt ? S.loadedLocal : store.kind === "file" ? S.savedNowhere : "");
  }
  sync.start();
  return store.kind;
}
