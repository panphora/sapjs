// The public entry. Wires the scheduler, the Sap(el) accessor, the delegated
// action layer, the console surface, and the optional platform bridges, then
// auto-mounts every [app] root on DOMContentLoaded.
//
//   Sap(el)          -> live write-through proxy onto el's scope/row
//   Sap.refresh()    -> synchronous full pass (set state, refresh, read on next line)
//   Sap.batch(l, fn) -> one labeled undo entry
//   Sap.status()     -> machine-readable green-line twin
//   Sap.report()     -> JSON twin of every error
//   Sap.why(el)      -> resolution inspector
//   Sap.debug(bool)  -> per-pass paint headers
//   Sap.doctor()     -> full-page audit
//   Sap.formats.x    -> register a format
//   Sap.mount(root?) -> mount a root (or all) explicitly

import { createScheduler } from "./scheduler.js";
import { runPass } from "./pass.js";
import { mountApp } from "./mount.js";
import { createAccessor } from "./scope.js";
import { createActions } from "./actions.js";
import { createDebug } from "./debug.js";
import { batch, installBridges } from "./platform.js";
import { formats } from "./helpers.js";

const VERSION = "0.1.0";

const registry = new Map(); // root element -> appRec
const order = []; // appRecs in mount order

const scheduler = createScheduler(runPass);

function appFor(el) {
  let cur = el;
  while (cur) {
    if (cur.nodeType === 1 && cur.hasAttribute && cur.hasAttribute("app")) {
      return registry.get(cur) || null;
    }
    cur = cur.parentNode && cur.parentNode.host ? cur.parentNode.host : cur.parentElement;
  }
  return null;
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
  schedule: (app, trigger) => scheduler.schedule(app, trigger),
  runNow: (app, trigger) => scheduler.runNow(app, trigger),
  moveInto,
  placeBefore,
  remountIfPresent: () => mountAll(),
};

const accessor = createAccessor(runtime);
const actions = createActions(runtime, accessor);
const debugApi = createDebug(runtime);

let installed = false;
function installOnce() {
  if (installed) return;
  installed = true;
  actions.install(document);
  installBridges(runtime);
}

function mountAll(docRoot = document) {
  installOnce();
  const roots = docRoot.querySelectorAll("[app]");
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
  return fresh;
}

function mount(rootOrSel) {
  installOnce();
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
Sap.why = debugApi.why;
Sap.debug = debugApi.debug;
Sap.doctor = debugApi.doctor;
Sap.greenLine = debugApi.greenLine;
Sap.formats = formats;
Sap.mount = mount;
Sap.app = function app(config = {}) {
  if (config.formats) Object.assign(formats, config.formats);
  return Sap;
};
Sap._registry = registry;
Sap._reset = function reset() {
  registry.clear();
  order.length = 0;
};

function autoMount() {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountAll());
  } else {
    mountAll();
  }
}

autoMount();

if (typeof window !== "undefined") window.Sap = Sap;

export default Sap;
export { Sap, mountAll, mount, runtime };
