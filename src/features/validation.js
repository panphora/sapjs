// invalid= messages. Collected during intake, applied after effects.

import { runWith } from "../compile.js";

function runInvalid(iv) {
  let msg = "";
  try {
    const v = runWith(iv.def.entry, iv.ctx.state, iv.ctx.item, iv.el, iv.ctx.root);
    msg = typeof v === "string" ? v : "";
  } catch {
    msg = "";
  }
  if (typeof iv.el.setCustomValidity === "function") iv.el.setCustomValidity(msg);
}

export const validationFeature = {
  name: "validation",
  begin(pass) {
    pass.invalids = [];
  },
  collect(pass, el, plan, ctx) {
    if (plan.invalids) for (const def of plan.invalids) pass.invalids.push({ def, el, ctx });
  },
  afterPaint(pass) {
    for (const iv of pass.invalids) runInvalid(iv);
  },
};
