// Mount one [sap] root: lint, then (if clean) adopt the runtime stylesheet and
// run the first synchronous pass. A halted app arms no listeners and writes nothing,
// so its file bytes stay frozen. Returns the app record the scheduler drives.

import { Diagnostics } from "./errors.js";
import { lintApp } from "./lint.js";
import { runPass } from "./pass.js";
import { rehydrateControlFromAttributes } from "./control-serialize.js";

const STYLE_ID = "sap-styles";
const STYLE_TEXT =
  "[item][template]{display:none!important}" +
  "[hidden]{display:none!important}" +
  "[sap-error]{outline:2px solid #e5484d;outline-offset:1px}";

const styledDocs = new WeakSet();

// Apply Sap's presentation rules without leaving a node in the saved file:
// adoptedStyleSheets live in the CSSOM, not the DOM tree, so a Hyperclay save
// never serializes them. Engines without constructable stylesheets fall back to
// a <style> node, which does serialize but keeps the rules working everywhere.
function injectStyles(doc) {
  if (styledDocs.has(doc)) return;
  const view = doc.defaultView;
  const SheetCtor = view && view.CSSStyleSheet;
  if (SheetCtor && "adoptedStyleSheets" in doc) {
    try {
      const sheet = new SheetCtor();
      sheet.replaceSync(STYLE_TEXT);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
      styledDocs.add(doc);
      return;
    } catch {
      // Older engine: fall through to the serialized <style> node.
    }
  }
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    (doc.head || doc.documentElement).appendChild(style);
  }
  styledDocs.add(doc);
}

let appSeq = 0;

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : 0;
}

export function mountApp(root) {
  const name = root.id || root.getAttribute("sap") || `app-${appSeq++}`;
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

  // Restore any persisted textarea values from data-value before the first read,
  // so a [persist] textarea round-trips on load without a separate save step.
  for (const ta of root.querySelectorAll("textarea[data-value]")) rehydrateControlFromAttributes(ta);

  const t0 = now();
  runPass(appRec, { trigger: "mount" });
  appRec._mountMs = now() - t0;
  appRec._mountWrites = appRec._stats ? appRec._stats.writes : 0;
  if (appRec._mountWrites > 0) {
    diag.warn("W30", root, {
      problem: `${appRec._mountWrites} paint(s) ran at mount; the saved file was out of sync with its declared state`,
      fix: "re-save once so the file mounts clean (a settled file writes nothing)",
    });
  }
  return appRec;
}
