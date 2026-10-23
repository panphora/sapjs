// detail="LIST by KEY": one record projected into a panel or a <dialog>. The
// panel's own state= key lives on the enclosing scope; the row lookup waits until
// the whole tree is read, so a panel placed before its list still finds it.

import { parseStateDecl, isPresenceDecl } from "../dom.js";
import { planOf, drainPlans } from "../plan.js";
import { compile, run } from "../compile.js";

// A path segment applied to an array collects that field from every row, so
// "lists.cards" is every card of every list.
function resolvePathValue(path, ctx) {
  const segs = String(path).split(".");
  const walk = (o) => {
    for (const s of segs) {
      if (o == null) return undefined;
      o = Array.isArray(o) ? o.flatMap((r) => (r && r[s] != null ? r[s] : [])) : o[s];
    }
    return o;
  };
  const o = walk(ctx.state);
  return o === undefined ? walk(ctx.root) : o;
}

function resolveDetail(pass, el, parentObj, ctx) {
  el._sapScope = parentObj;
  const spec = el.getAttribute("detail") || "";
  const m = /^([\w.]+)\s+by\s+(.+)$/.exec(spec);
  if (!m) {
    el.hidden = true;
    el._sapDetailRow = null;
    return;
  }
  const listPath = m[1];
  const keyExpr = m[2].trim();
  const arr = resolvePathValue(listPath, ctx);
  let keyVal;
  try {
    keyVal = run(compile(keyExpr), { state: parentObj, item: ctx.item, el, root: ctx.root });
  } catch {
    keyVal = undefined;
  }
  const row = Array.isArray(arr) && keyVal != null
    ? arr.find((r) => r && typeof r === "object" && r.$el && String(r.$key) === String(keyVal))
    : null;
  el._sapDetailRow = row ? row.$el : null;
  if (el.tagName === "DIALOG") {
    // A dialog found closed while the key it was opened for still matches was
    // dismissed by the user; it stays closed until the key changes.
    const k = row ? String(row.$key) : null;
    if (k !== el._sapDetailKey) {
      el._sapDetailKey = k;
      el._sapDismissed = false;
    }
    if (!row) {
      el._sapOpenedFor = null;
      if (el.open && typeof el.close === "function") {
        el._sapEngineClose = true;
        el.close();
      }
      return;
    }
    if (el.open) {
      el._sapOpenedFor = k;
    } else {
      if (el._sapOpenedFor === k) el._sapDismissed = true;
      el._sapOpenedFor = null;
      if (!el._sapDismissed && el.isConnected && typeof el.showModal === "function") {
        if (el.hidden) el.hidden = false;
        el.showModal();
        el._sapOpenedFor = k;
      }
    }
  } else {
    if (!row) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    if (el.hidden) el.hidden = false;
  }
  // Opening the panel above can run page code (focus and toggle events) that edits
  // its attributes, so their plans are cleared before the panel is read.
  drainPlans();
  const dctx = { root: ctx.root, state: parentObj, item: row, ownerEl: row.$el, projection: true };
  pass.collectEl(el, planOf(el), dctx);
  pass.walkScope(el, row, dctx);
}

export const detailFeature = {
  name: "detail",
  begin(pass) {
    pass.deferredDetails = [];
  },
  boundary: {
    detail(pass, el, plan, parentObj, ctx) {
      for (const d of parseStateDecl(el.getAttribute("state") || "")) {
        if (!(d.name in parentObj)) parentObj[d.name] = isPresenceDecl(el, d) ? el.hasAttribute(d.attr) : pass.resolveDefault(el, d);
      }
      pass.deferredDetails.push({ el, parentObj, ctx });
    },
  },
  afterIntake(pass) {
    for (let i = 0; i < pass.deferredDetails.length; i++) {
      const { el, parentObj, ctx } = pass.deferredDetails[i];
      resolveDetail(pass, el, parentObj, ctx);
    }
  },
};
