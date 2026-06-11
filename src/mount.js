// Mount one [app] root: lint, then (if clean) inject the template-hiding CSS and
// run the first synchronous pass. A halted app arms no listeners and writes nothing,
// so its file bytes stay frozen. Returns the app record the scheduler drives.

import { Diagnostics } from "./errors.js";
import { lintApp } from "./lint.js";
import { runPass } from "./pass.js";

const STYLE_ID = "sap-styles";
const STYLE_TEXT =
  "[item][template]{display:none!important}" +
  "[sap-error]{outline:2px solid #e5484d;outline-offset:1px}";

function injectStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  (doc.head || doc.documentElement).appendChild(style);
}

let appSeq = 0;

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : 0;
}

export function mountApp(root) {
  const name = root.id || root.getAttribute("app") || `app-${appSeq++}`;
  const diag = new Diagnostics(name);
  const appRec = {
    root, name, diag,
    _state: null, _stats: null, _lastPass: null,
    _passes: 0, _broken: false, _mountMs: 0, _mountWrites: 0,
  };

  const ok = lintApp(root, diag);
  if (!ok) {
    appRec.halted = true;
    return appRec;
  }

  injectStyles(root.ownerDocument);

  const t0 = now();
  runPass(appRec, { trigger: "mount" });
  appRec._mountMs = now() - t0;
  appRec._mountWrites = appRec._stats ? appRec._stats.writes : 0;
  return appRec;
}
