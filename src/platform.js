// Optional Hyperclay integration. Everything here degrades to a no-op when
// window.hyperclay is absent, so Sap runs standalone in any HTML file. When the
// platform is present, Sap rides its live-sync, undo, and autosave for free.

export function batch(label, fn) {
  if (typeof fn !== "function") throw new Error("Sap.batch(label, fn): fn must be a function");
  const u = typeof window !== "undefined" && window.hyperclay && window.hyperclay.undo;
  if (u && u.flush) u.flush();
  const r = fn();
  if (r && typeof r.then === "function") throw new Error("Sap.batch fn must be synchronous (it returned a promise)");
  if (u && u.commitCaptured) u.commitCaptured(label);
  return r;
}

// Wire live-sync and undo to a synchronous refresh, and re-mount if a morph
// replaces the [app] element wholesale (delegated listeners would die silently).
export function installBridges(runtime) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const refreshConnected = () => {
    for (const app of runtime.apps()) {
      if (app.root.isConnected) runtime.runNow(app, "platform");
      else runtime.remountIfPresent();
    }
  };

  // M2: livesync-applied must refresh synchronously inside the pause window.
  document.addEventListener("hyperclay:livesync-applied", refreshConnected);

  // Undo/redo replay attributes with no events; re-derive after.
  const undo = window.hyperclay && window.hyperclay.undo;
  if (undo && typeof undo.on === "function") {
    undo.on("undo", refreshConnected);
    undo.on("redo", refreshConnected);
  } else {
    // Lazy handshake: the platform may load after us.
    window.addEventListener("hyperclay:mutation-ready", () => {
      const u = window.hyperclay && window.hyperclay.undo;
      if (u && typeof u.on === "function") {
        u.on("undo", refreshConnected);
        u.on("redo", refreshConnected);
      }
    });
  }
}
