// effect= statements. Collected during intake, run after every paint.

import { runWith } from "../compile.js";
import { setBeacon, clearBeacon } from "../errors.js";

function runEffect(e, app) {
  try {
    runWith(e.def.entry, e.ctx.state, e.ctx.item, e.el, e.ctx.root);
    clearBeacon(e.el);
  } catch (err) {
    app.diag.error("E24", e.el, { attr: "effect", expr: e.def.entry && e.def.entry.src, problem: String(err.message) });
    setBeacon(e.el, "E24");
  }
}

export const effectFeature = {
  name: "effect",
  begin(pass) {
    pass.effects = [];
  },
  collect(pass, el, plan, ctx) {
    if (!plan.effects) return false;
    for (const def of plan.effects) pass.effects.push({ def, el, ctx });
  },
  afterPaint(pass) {
    for (const e of pass.effects) runEffect(e, pass.app);
  },
};
