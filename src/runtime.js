// The engine every entry shares: the app registry, scheduler, mount, and the
// public Sap surface. An entry supplies the Sap(el) accessor and the input layer.

import { createScheduler } from "./scheduler.js";
import { runPass } from "./pass.js";
import { mountApp } from "./mount.js";
import { createDebug } from "./debug.js";
import { batch, installBridges, whenPlatformReady, capability } from "./platform.js";
import { installMutationBridge, resetMutationBridge } from "./mutation-bridge.js";
import { formats } from "./helpers.js";
import { VERSION } from "./version.js";
import { serializeControlToAttributes, finalizeControlForSave, rehydrateControlFromAttributes } from "./control-serialize.js";

export function createSap({ createAccessor, installInput, debugExtras }) {
  const registry = new Map(); // root element -> appRec
  const order = []; // appRecs in mount order

  const scheduler = createScheduler(runPass);

  function appFor(el) {
    let cur = el;
    while (cur) {
      if (cur.nodeType === 1 && cur.hasAttribute && cur.hasAttribute("sap")) {
        return registry.get(cur) || null;
      }
      cur = cur.parentNode && cur.parentNode.host ? cur.parentNode.host : cur.parentElement;
    }
    return null;
  }

  // Splice apps whose roots have left the DOM out of order/registry. The mutation
  // bridge calls this each batch so a disconnected app cannot force a full-document
  // re-scan on every change; it also fixes the pre-existing append-only order leak.
  function pruneDisconnected() {
    for (let i = order.length - 1; i >= 0; i--) {
      const app = order[i];
      if (!app.root.isConnected) {
        registry.delete(app.root);
        order.splice(i, 1);
      }
    }
  }

  function moveInto(parent, el) {
    if (parent.moveBefore) {
      try { parent.moveBefore(el, null); return; } catch { /* fall through */ }
    }
    parent.appendChild(el);
  }

  function placeBefore(el, ref) {
    const parent = ref.parentElement;
    if (!parent) return;
    if (parent.moveBefore) {
      try { parent.moveBefore(el, ref); return; } catch { /* fall through */ }
    }
    parent.insertBefore(el, ref);
  }

  const runtime = {
    apps: () => order.slice(),
    appFor,
    isRegistered: (el) => registry.has(el),
    pruneDisconnected,
    schedule: (app, trigger) => scheduler.schedule(app, trigger),
    runNow: (app, trigger) => scheduler.runNow(app, trigger),
    moveInto,
    placeBefore,
    remountIfPresent: () => mountAll(),
  };

  const accessor = createAccessor(runtime);
  const debugApi = createDebug(runtime);
  const extras = debugExtras ? debugExtras(runtime, debugApi) : {};

  let installed = false;
  let disabled = false;
  let teardownBridges = null;
  function installOnce() {
    if (installed) return;
    installed = true;
    installInput(runtime, accessor, document);
    teardownBridges = installBridges(runtime);
  }

  function announceMounted() {
    const derived = capability("derived");
    if (derived && typeof derived.mounted === "function") derived.mounted();
  }

  function mountAll(docRoot = document) {
    if (disabled) return [];
    installOnce();
    installMutationBridge(runtime);
    const roots = docRoot.querySelectorAll("[sap]");
    const fresh = [];
    for (const root of roots) {
      if (registry.has(root)) continue;
      const appRec = mountApp(root);
      registry.set(root, appRec);
      order.push(appRec);
      fresh.push(appRec);
    }
    for (const app of fresh) {
      const line = debugApi.greenLine(app);
      if (app.diag.errors.length || app.halted) console.error(line);
      else console.log(line);
    }
    announceMounted();
    return fresh;
  }

  function mount(rootOrSel) {
    if (disabled) return null;
    installOnce();
    installMutationBridge(runtime);
    if (!rootOrSel) return mountAll();
    const root = typeof rootOrSel === "string" ? document.querySelector(rootOrSel) : rootOrSel;
    if (!root) return null;
    if (registry.has(root)) return registry.get(root);
    const appRec = mountApp(root);
    registry.set(root, appRec);
    order.push(appRec);
    const line = debugApi.greenLine(appRec);
    if (appRec.diag.errors.length || appRec.halted) console.error(line);
    else console.log(line);
    return appRec;
  }

  // The public Sap is the accessor function with the API hung off it.
  const Sap = accessor.Sap;

  Sap.version = VERSION;
  Sap.refresh = function refresh() {
    for (const app of order) if (app.root.isConnected) scheduler.runNow(app, "refresh");
  };
  Sap.batch = batch;
  Sap.status = debugApi.status;
  Sap.report = debugApi.report;
  Sap.why = extras.why;
  Sap.debug = debugApi.debug;
  Sap.doctor = extras.doctor;
  Sap.greenLine = debugApi.greenLine;
  Sap.formats = formats;
  Sap.serializeControlToAttributes = serializeControlToAttributes;
  Sap.finalizeControlForSave = finalizeControlForSave;
  Sap.rehydrateControlFromAttributes = rehydrateControlFromAttributes;
  Sap.mount = mount;
  Sap.config = function config(options = {}) {
    if (options.formats) Object.assign(formats, options.formats);
    return Sap;
  };
  Sap._registry = registry;
  Sap._reset = function reset() {
    registry.clear();
    order.length = 0;
    resetMutationBridge();
  };
  // Hands the page to another copy of the engine: this one keeps its listeners but
  // owns no app, so they find nothing to schedule.
  Sap.unmount = function unmount() {
    disabled = true;
    registry.clear();
    order.length = 0;
    resetMutationBridge();
    if (typeof teardownBridges === "function") teardownBridges();
  };

  return { Sap, mountAll, mount, runtime };
}

export function autoMount(mountAll) {
  if (typeof document === "undefined") return;
  const go = () => whenPlatformReady(() => mountAll());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go);
  } else {
    go();
  }
}
