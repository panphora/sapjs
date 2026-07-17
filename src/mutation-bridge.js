// Universal DOM-mutation reactivity: sapjs re-derives when the page changes by ANY
// means, not just its own delegated events. Two interchangeable backends sit behind
// one MutationSource seam:
//
//   - hubSource:    when window.hyperclay.Mutation is present, ride the platform's
//                   central, pause-gated observer. The hub already coordinates the
//                   live-sync / undo pause windows, so we inherit them for free.
//   - nativeSource: standalone, a sapjs-owned MutationObserver on document.body.
//
// Self-paint suppression: every pass runs inside withDomMutationPaused(), so a pass's
// own DOM writes are vacuumed away from the bridge and never schedule another pass:
//   - hub:    Mutation.pause()/resume() — the hub drains the pass's records to its
//             NON-pausable consumers only, so our pausable subscription never sees them.
//   - native: observer.takeRecords() at the pause boundary discards the pass's records
//             before the browser delivers them.
//
// Exactly one source is active at a time. A native source CEDES to a hub that arrives
// late (teardown + re-subscribe), so the two never observe at once. Degrades to a
// plain no-op when neither a hub nor a MutationObserver is present.

let activeSource = null;
let installed = false;
let lateHubListener = null;

function hubSource(M) {
  let unsub = null;
  return {
    kind: "hub",
    subscribe(onChanges) {
      // pausable (the default) is load-bearing: it is WHY the hub's resume()-drain
      // routes our own pass's writes to non-pausable consumers only, excluding us.
      const ret = M.onAnyChange({ debounce: 0, require: "observed" }, onChanges);
      if (typeof ret === "function") unsub = ret;
    },
    suppress(fn) {
      M.pause(); // bridges undo.pause + gates the pausable lanes (autosave included)
      try { return fn(); } finally { M.resume(); }
    },
    teardown() { if (unsub) { try { unsub(); } catch { /* ignore */ } unsub = null; } },
  };
}

function nativeSource() {
  let observer = null;
  return {
    kind: "native",
    subscribe(onChanges) {
      observer = new MutationObserver((records) => onChanges(changesFromRecords(records)));
      const target = (typeof document !== "undefined" && document.body) ||
        (typeof document !== "undefined" && document.documentElement);
      if (target) {
        observer.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
      }
    },
    suppress(fn) {
      // No hub to gate us: drop our own pass's records before the browser delivers them.
      // Pause undo too if it somehow exists hub-less (presence-guarded; normally it does not).
      const u = typeof window !== "undefined" && window.hyperclay && window.hyperclay.undo;
      if (u && u.pause) u.pause();
      try {
        return fn();
      } finally {
        if (observer) observer.takeRecords();
        if (u && u.resume) u.resume();
      }
    },
    teardown() { if (observer) { observer.disconnect(); observer = null; } },
  };
}

// Normalize MutationRecords into the hub's change shape { type, element, parent },
// mirroring the hub's added-subtree expansion and removed-node parent resolution, and
// skipping sap-inert subtrees (sap-ignore / template) — the standalone analogue of the
// hub's intake isInert drop.
function changesFromRecords(records) {
  const out = [];
  for (const rec of records) {
    if (rec.type === "attributes") {
      const el = rec.target;
      if (el && el.nodeType === 1 && !inertSubtree(el)) out.push({ type: "attribute", element: el });
    } else if (rec.type === "characterData") {
      const el = rec.target && rec.target.parentElement;
      if (el && !inertSubtree(el)) out.push({ type: "characterData", element: el });
    } else if (rec.type === "childList") {
      for (const node of rec.addedNodes) {
        if (node.nodeType !== 1 || inertSubtree(node)) continue;
        out.push({ type: "add", element: node });
        if (node.querySelectorAll) {
          for (const desc of node.querySelectorAll("*")) {
            if (!inertSubtree(desc)) out.push({ type: "add", element: desc });
          }
        }
      }
      for (const node of rec.removedNodes) {
        if (node.nodeType !== 1) continue;
        out.push({ type: "remove", element: node, parent: rec.target });
      }
    }
  }
  return out;
}

function inertSubtree(el) {
  return !!(el.closest && el.closest("[sap-ignore],[template]"));
}

// Shared by both backends: resolve each change to its owning [sap] app and schedule it
// once. Prune apps whose roots have left the DOM (keeps the per-batch cost O(apps), not
// a full-document re-scan), and re-mount when a fresh [sap] root is injected.
function scheduleAffectedApps(runtime, changes) {
  runtime.pruneDisconnected();
  const affected = new Set();
  let needRemount = false;
  for (const c of changes) {
    const target = c.type === "remove" ? c.parent : c.element; // a removed node is detached
    const app = target && runtime.appFor(target);
    if (app) affected.add(app);
    if (c.type === "add" && c.element && c.element.nodeType === 1 &&
        c.element.hasAttribute && c.element.hasAttribute("sap") &&
        !(runtime.isRegistered && runtime.isRegistered(c.element))) {
      needRemount = true; // an injected [sap] root
    }
  }
  if (needRemount) runtime.remountIfPresent();
  for (const app of affected) if (app.root.isConnected) runtime.schedule(app, "mutation");
}

// The single suppression entry point. pass.js wraps the whole pass in this; it delegates
// to the active source. With no source yet (pre-install / no DOM), it preserves the
// historical undo-pause-if-present behavior so derived writes still stay off the undo stack.
export function withDomMutationPaused(fn) {
  if (activeSource) return activeSource.suppress(fn);
  const u = typeof window !== "undefined" && window.hyperclay && window.hyperclay.undo;
  if (u && u.pause && u.resume) {
    u.pause();
    try { return fn(); } finally { u.resume(); }
  }
  return fn();
}

function activate(source, runtime) {
  installed = true;
  activeSource = source;
  source.subscribe((changes) => scheduleAffectedApps(runtime, changes));
}

// Idempotent. Called from mountAll/mount; re-arms after resetMutationBridge().
export function installMutationBridge(runtime) {
  if (installed) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const w = window;
  const M = w.hyperclay && w.hyperclay.Mutation;

  if (M && typeof M.onAnyChange === "function") { activate(hubSource(M), runtime); return; }

  // No usable Mutation hub yet. We do NOT treat a bare window.hyperclay as a promise that
  // a hub is coming: another library may merely own that namespace (e.g. a consent shim)
  // and never publish a Mutation hub, which would strand us in a permanent wait with dead
  // reactivity. So observe natively now and CEDE to a real hub if one arrives later
  // (teardown + re-subscribe on the document-dispatched hyperclay:mutation-ready — a
  // window-dispatched event is ignored, matching the hub's own target). The handoff is
  // safe: passes are idempotent, so the brief pre-hub native window costs at most a little
  // redundant work, never correctness, and the two never observe simultaneously.
  if (typeof MutationObserver === "function") {
    activate(nativeSource(), runtime);
    lateHubListener = function onLateHub() {
      const M2 = w.hyperclay && w.hyperclay.Mutation;
      if (!M2) return;
      document.removeEventListener("hyperclay:mutation-ready", lateHubListener);
      lateHubListener = null;
      if (activeSource) activeSource.teardown();
      installed = false;
      activate(hubSource(M2), runtime);
    };
    document.addEventListener("hyperclay:mutation-ready", lateHubListener);
  }
  // else: no DOM observer (SSR / ancient) -> event-only, exactly as before.
}

// Tear down and re-arm. Sap._reset() calls this so each test gets a fresh bridge that
// reflects the current window.hyperclay; production never calls it.
export function resetMutationBridge() {
  if (activeSource) { try { activeSource.teardown(); } catch { /* ignore */ } }
  if (lateHubListener && typeof document !== "undefined") {
    document.removeEventListener("hyperclay:mutation-ready", lateHubListener);
  }
  activeSource = null;
  installed = false;
  lateHubListener = null;
}

// Test hook: which backend is active ("hub" | "native" | null).
export function _activeSourceKind() {
  return activeSource ? activeSource.kind : null;
}
