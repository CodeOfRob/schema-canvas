// Wires the storage interface to the viewer state: startup load, saving after each commit, conflict dialog,
// and the question what to do with a saved state that was based on another built-in target (snapshot-base.js).
import { STATE_FORMAT, parseSnapshot } from "../model.js";
import { decideSavedState } from "../snapshot-base.js";
import { createLocalStore, createSync, openStore, readLocalJson } from "../storage.js";
import { S } from "../strings.js";
import { onCommit, placeMissing, refresh } from "./actions.js";
import { flash } from "./toolbar.js";
import { state, entityById, hasTarget } from "./state.js";

const time = iso => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const dateTime = iso => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** @param base fingerprint the held state counts as based on from now on (state.base, written with every save) */
function applySnapshot(snapshot, base) {
  if (hasTarget()) state.target = snapshot.target;
  state.layout = snapshot.layout;
  state.base = base;
  placeMissing("current");
  placeMissing("target");
  state.undo = [];
  if (state.sel && state.sel.kind !== "rel" && !entityById(state.sel.eid || state.sel.id)) state.sel = null;
}

/**
 * Applies the snapshot this browser saved last time, before anything renders, when it is based on this page's
 * built-in target. Returns null (nothing usable saved), { status: "applied", savedAt }, or { status: "ask", snapshot }
 * (based on another built-in target: not applied, initPersistence asks the viewer).
 */
export function applyLocalSnapshot() {
  const raw = readLocalJson(state.prefsKey + ":state", null);
  if (!raw) return null;
  let snapshot;
  try {
    snapshot = parseSnapshot(raw, hasTarget());
  } catch (error) {
    console.error("schema-canvas: ignoring the locally saved state", error);
    return null;
  }
  if (decideSavedState(state.builtInBase, snapshot) === "ask") return { status: "ask", snapshot };
  applySnapshot(snapshot, state.builtInBase);
  return { status: "applied", savedAt: snapshot.savedAt };
}

/** Shows one of the choice dialogs and resolves with the data-choice of the clicked button. */
function askChoice(dialogId, savedAtText) {
  const dialog = document.getElementById(dialogId);
  dialog.querySelector(".c-time").textContent = savedAtText;
  dialog.hidden = false;
  return new Promise(resolve => {
    dialog.onclick = ev => {
      const button = ev.target.closest("[data-choice]");
      if (!button) return;
      dialog.hidden = true;
      dialog.onclick = null;
      resolve(button.dataset.choice);
    };
  });
}

function showConflict(snapshot, choice) {
  askChoice("conflict", new Date(snapshot.savedAt).toLocaleTimeString())
    .then(picked => (picked === "theirs" ? choice.takeTheirs() : choice.keepMine()));
}

/**
 * The saved snapshot was based on another built-in target. The page shows its built-in target until the viewer
 * picks; nothing is saved meanwhile. Either choice is a decision about this page version, so it is saved at once
 * with the current fingerprint as base: the question does not come back on the next load, and in the shared
 * store everyone gets the decided state (the store holds one state for all, like the conflict dialog's choice).
 *   "page"  - keep the built-in target and layout (plus edits made while the dialog was open); the saved state is replaced
 *   "saved" - apply the saved target and layout; edits made while the dialog was open are dropped
 */
async function resolveStaleSnapshot(sync, snapshot) {
  sync.pause();
  flash(S.staleStatus);
  const picked = await askChoice("stale-state", dateTime(snapshot.savedAt));
  if (picked === "saved") {
    applySnapshot(snapshot, state.builtInBase);
    refresh();
  } else {
    state.base = state.builtInBase;
  }
  sync.resume();
  await sync.saveNow();
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

/** @param localSnapshot what applyLocalSnapshot returned */
export async function initPersistence(localSnapshot) {
  const localKey = state.prefsKey + ":state";
  const store = await openStore({ docPath: state.page.config.dbDocPath, localKey });
  const sync = createSync({
    store,
    cache: store.kind === "artifactDb" ? createLocalStore(localKey) : null,
    snapshot: () => ({ format: STATE_FORMAT, base: state.base, target: state.target, layout: state.layout }),
    validate: raw => parseSnapshot(raw, hasTarget()),
    // A live snapshot keeps the base it was saved with, so a state from another page version is still recognised at the next load.
    adopt: snapshot => { applySnapshot(snapshot, snapshot.base); refresh(); },
    onConflict: showConflict,
    onStatus,
    isBusy: () => state.dragging,
  });
  onCommit(() => sync.schedule());
  const localApplied = localSnapshot && localSnapshot.status === "applied";
  if (localApplied) sync.markLoaded(localSnapshot.savedAt);
  let stale = localSnapshot && localSnapshot.status === "ask" ? localSnapshot.snapshot : null;
  if (store.kind === "artifactDb") {
    try {
      const raw = await store.load();
      if (raw && !sync.dirty) {
        const snapshot = parseSnapshot(raw, hasTarget());
        stale = null; // the shared state supersedes this browser's cache
        if (decideSavedState(state.builtInBase, snapshot) === "ask") {
          stale = snapshot;
        } else {
          applySnapshot(snapshot, state.builtInBase);
          sync.markLoaded(snapshot.savedAt);
          refresh();
          flash(S.loadedShared);
        }
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
    flash(localApplied ? S.loadedLocal : store.kind === "file" ? S.savedNowhere : "");
  }
  if (stale) await resolveStaleSnapshot(sync, stale);
  sync.start();
  return store.kind;
}
