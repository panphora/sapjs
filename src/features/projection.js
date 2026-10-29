// A bind inside an each= row or a detail panel is a projection: the pass paints the
// control from the record it shows, and the input layer writes edits back to it.

import { ownsField, recordElOf, isComposer } from "../dom.js";
import { readControl, writeControl, kindOf } from "../carrier.js";

function applyProjection(el, v) {
  if (el === el.ownerDocument.activeElement) return 0; // user is typing here
  if (el.type === "radio") {
    const want = v != null && String(el.value) === String(v);
    if (el.checked === want) return 0;
    el.checked = want;
    return 1;
  }
  const kind = kindOf(el);
  const cur = readControl(el, kind);
  const nv = v == null ? "" : v;
  if (String(cur) !== String(nv)) {
    writeControl(el, kind, nv);
    return 1;
  }
  return 0;
}

export const projectionFeature = {
  name: "projection",
  collect(pass, el, plan, ctx) {
    if (!(plan.bind != null && (ctx.view || ctx.projection) && !isComposer(el))) return false;
    const field = plan.bind;
    const paints = pass.paints;
    if (!ctx.view) {
      paints.push({ def: { kind: "projection", field, from: null }, el, ctx });
    } else if (ownsField(recordElOf(ctx.item), field)) {
      el._sapViewBind = "item";
      paints.push({ def: { kind: "projection", field, from: "item" }, el, ctx });
    } else if (field in ctx.state || field in ctx.root) {
      el._sapViewBind = "drawn";
      paints.push({ def: { kind: "projection", field, from: "drawn" }, el, ctx });
    } else {
      el._sapViewBind = null;
      pass.app.diag.error("E43", el, {
        attr: "bind", expr: field,
        problem: `bind="${field}" inside an each row matches no field of the row's record or of the scope the row is drawn in`,
        fix: "bind a field the record owns (bind, state= or items= on the [item]), or declare it with state= where the list is drawn",
      });
    }
  },
  paintKinds: {
    projection(p) {
      const def = p.def;
      if (def.from === "drawn") {
        const s = def.field in p.ctx.state ? p.ctx.state : p.ctx.root;
        return applyProjection(p.el, s[def.field]);
      }
      return applyProjection(p.el, p.ctx.item ? p.ctx.item[def.field] : "");
    },
  },
};
