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

// Both clients dispatch the same moment under different names, and clayjs fires its
// pair back to back in one tick. A plain listener on each name would run the handler
// twice per occurrence.
export const MUTATION_READY = ["clay:mutation-ready", "hyperclay:mutation-ready"];
export const LIVESYNC_APPLIED = ["clay:sync-applied", "hyperclay:livesync-applied"];

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
    if (disconnected) {
      runtime.pruneDisconnected();
      runtime.remountIfPresent();
    }
  };

  // M2: livesync-applied must refresh synchronously inside the pause window.
  onPlatformEvent(document, LIVESYNC_APPLIED, refreshConnected);

  // Undo/redo replay attributes with no events; re-derive after.
  const undo = capability("undo");
  if (undo && typeof undo.on === "function") {
    undo.on("undo", refreshConnected);
    undo.on("redo", refreshConnected);
  } else {
    // Lazy handshake: the platform may load after us. The hub dispatches
    // mutation-ready non-bubbling on `document`, so listen there (not window).
    onPlatformEvent(document, MUTATION_READY, () => {
      const u = capability("undo");
      if (u && typeof u.on === "function") {
        u.on("undo", refreshConnected);
        u.on("redo", refreshConnected);
      }
    });
  }
}
