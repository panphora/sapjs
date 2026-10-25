// Optional Hyperclay integration. Everything here degrades to a no-op when no
// platform client is present, so Sap runs standalone in any HTML file. When the
// platform is present, Sap rides its live-sync, undo, and autosave for free.

// Two clients provide this API and they spell one of these capabilities
// differently: hyperclayjs owns window.hyperclay and calls the dialog consent();
// clayjs owns window.clay and calls it confirm(). Resolving `clay ?? hyperclay` as
// one namespace would land on clay and then find no consent, so a confirm-gated
// action would silently drop back to the native window.confirm box. Hence per
// capability rather than per namespace.
export function capability(name) {
  if (typeof window === "undefined") return null;
  const clay = window.clay, hyperclay = window.hyperclay;
  if (name === "consent") return clay?.confirm || hyperclay?.consent || null;
  return clay?.[name] || hyperclay?.[name] || null;
}

// True when ClayJS poured a visitor's saved edits into the page before this mount.
// The derived copies baked into the file still show the original data, so the first
// pass is expected to repaint them.
export function draftsRestored() {
  const drafts = capability("visitorDrafts");
  return Boolean(drafts && typeof drafts.restored === "function" && drafts.restored()?.restored);
}

// Both clients dispatch the same moment under different names, and clayjs fires its
// pair back to back in one tick. A plain listener on each name would run the handler
// twice per occurrence.
export const MUTATION_READY = ["clay:mutation-ready", "hyperclay:mutation-ready"];
export const LIVESYNC_APPLIED = ["clay:sync-applied", "hyperclay:livesync-applied"];
export const PLATFORM_READY = ["clay:ready", "hyperclay:ready"];
export const ROUTE_CHANGED = ["clay:route"];
export const MODE_CHANGED = ["clay:modechange"];

// The first name to arrive claims the tick, and only a DIFFERENT name is suppressed
// while it holds the claim. Guarding on "have I run at all this tick" would collapse
// two genuine occurrences into one.
export function onPlatformEvent(target, names, handler) {
  let claimedBy = null;
  const wrapped = (event) => {
    if (claimedBy !== null && claimedBy !== event.type) return;
    claimedBy = event.type;
    queueMicrotask(() => { claimedBy = null; });
    handler(event);
  };
  for (const name of names) target.addEventListener(name, wrapped);
  return () => { for (const name of names) target.removeEventListener(name, wrapped); };
}

// Run fn once ClayJS has finished booting, or now if ClayJS is absent. Frozen
// regions record their authored markup during that boot, so a first paint before it
// would be recorded instead. A failed boot still runs fn: the app must not stay dead.
export function whenPlatformReady(fn) {
  const ready = typeof window !== "undefined" && window.clay && window.clay.ready;
  if (ready && typeof ready.then === "function") ready.then(() => fn(), () => fn());
  else fn();
}

// Region-aware save guard. When the platform's region model is present, a control
// inside a no-save (or frozen) region must not write save-bytes the platform would
// strip anyway. The control stays fully live and reactive; only the serialization
// mirror is skipped. Standalone (no region API) returns false, so Sap mirrors as
// before — same "use the platform feature if present, degrade otherwise" pattern
// as the undo and optionVisibility handshakes.
export function regionSkipsSave(el) {
  const region = capability("region");
  if (!region || typeof region.resolveRegionPolicy !== "function" || typeof region.skipForPolicy !== "function") {
    return false;
  }
  return region.skipForPolicy(region.resolveRegionPolicy(el), undefined, ["no-save", "freeze"]);
}

export function modeSession() {
  if (typeof window === "undefined") return null;
  return window.clay?.modeLifecycle || null;
}

export function mayWriteRecord(node, { transient = false } = {}) {
  if (transient) return true;
  const lifecycle = typeof window === "undefined" ? null : window.clay?.modeLifecycle;
  if (typeof lifecycle?.canWrite !== "function") return true;
  const policy = capability("region")?.resolveRegionPolicy?.(node);
  if (policy?.persist === "none") return true;
  return lifecycle.canWrite();
}

// Themed confirmation dialog. When the platform's consent() is present (the
// `everything` preset bundles both dialogs and sap), a confirm-gated action uses
// it instead of the native window.confirm box. consent(msg, yesCallback) fires the
// callback synchronously on confirm and rejects on cancel, so Sap passes its action
// as the callback and never goes async. Returns null standalone, so Sap falls back
// to window.confirm — same degrade-otherwise pattern as the region/undo handshakes.
export function platformConsent() {
  const fn = capability("consent");
  return typeof fn === "function" ? fn : null;
}

export function batch(label, fn) {
  if (typeof fn !== "function") throw new Error("Sap.batch(label, fn): fn must be a function");
  const u = capability("undo");
  if (u && u.flush) u.flush();
  const r = fn();
  if (r && typeof r.then === "function") throw new Error("Sap.batch fn must be synchronous (it returned a promise)");
  if (u && u.commitCaptured) u.commitCaptured(label);
  return r;
}

// Wire live-sync and undo to a synchronous refresh, and re-mount if a morph
// replaces the [sap] element wholesale (delegated listeners would die silently).
export function installBridges(runtime) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const refreshConnected = () => {
    let disconnected = false;
    for (const app of runtime.apps()) {
      if (app.root.isConnected) runtime.runNow(app, "platform");
      else disconnected = true;
    }
    // A morph may have replaced a root wholesale: drop the dead app records (so they
    // don't pile up in order) and re-mount to pick up the replacement.
    if (disconnected) runtime.pruneDisconnected();
    // A merge can also add a root; mountAll skips the ones already registered.
    runtime.remountIfPresent();
  };

  // A host that treats paints as derived repaints them itself, inside the merge and
  // before it records any baseline. An older host only announces the merge, so
  // livesync-applied must refresh synchronously inside the pause window (M2).
  const derived = capability("derived");
  const offDerived = derived && typeof derived.register === "function" ? derived.register(refreshConnected) : null;
  const offApplied = typeof offDerived === "function" ? null : onPlatformEvent(document, LIVESYNC_APPLIED, refreshConnected);

  // A clay-router route change is not a DOM edit, but expressions read the route
  // (the open record, the active tab), so re-derive on it the same way.
  const offRoute = onPlatformEvent(document, ROUTE_CHANGED, refreshConnected);

  // Undo/redo replay attributes with no events; re-derive after. Mutation readiness
  // is only an early compatibility retry: it truthfully announces the Mutation hub
  // and nothing else. Full platform readiness is the point at which optional plugins
  // such as undo are guaranteed to have been published. A committed mode change
  // starts a new session: the optional plugin may be republished under a fresh
  // implementation, and a stale subscription would keep refreshing a retired scope.
  // So the pair is kept as handles and refreshed once whenever the implementation or
  // the mode generation changes.
  let undoHandles = null;
  let disposed = false;

  const modeGeneration = () => {
    const state = modeSession()?.state;
    return state ? state.generation : null;
  };

  const unbindUndo = () => {
    const handles = undoHandles;
    if (!handles) return;
    undoHandles = null;
    handles.offUndo();
    handles.offRedo();
  };

  const bindUndo = () => {
    if (disposed) return false;
    const undo = capability("undo");
    const generation = modeGeneration();
    if (!undo || typeof undo.on !== "function") {
      unbindUndo();
      return false;
    }
    if (undoHandles && undoHandles.impl === undo && undoHandles.generation === generation) return true;
    unbindUndo();
    // hyper-undo's delegator (src/index.js:142) returns undefined and silently drops
    // the subscription when on() is called before start(). A real subscription returns
    // its own unsubscribe function, so that return value is the only reliable proof the
    // handler actually attached. Stay unbound otherwise so a later signal retries.
    const offUndo = undo.on("undo", refreshConnected);
    if (typeof offUndo !== "function") return false;
    const offRedo = undo.on("redo", refreshConnected);
    if (typeof offRedo !== "function") { offUndo(); return false; }
    undoHandles = { impl: undo, generation, offUndo, offRedo };
    return true;
  };

  bindUndo();
  const offMutationReady = onPlatformEvent(document, MUTATION_READY, bindUndo);
  const offPlatformReady = onPlatformEvent(document, PLATFORM_READY, bindUndo);
  const offModeChanged = onPlatformEvent(document, MODE_CHANGED, bindUndo);
  const ready = capability("ready");
  if (ready && typeof ready.then === "function") ready.then(() => bindUndo(), () => {});

  return () => {
    disposed = true;
    if (typeof offDerived === "function") offDerived();
    if (offApplied) offApplied();
    offRoute();
    offMutationReady();
    offPlatformReady();
    offModeChanged();
    unbindUndo();
  };
}
