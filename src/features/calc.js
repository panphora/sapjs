// calc: fields. Collected during intake, computed deepest scopes first and in
// dependency order within each scope, before lists reconcile and paints run.

import { runWith, topoSort } from "../compile.js";
import { setBeacon, clearBeacon } from "../errors.js";

function depth(el) {
  let d = 0;
  let c = el;
  while (c) {
    if (c.hasAttribute && c.hasAttribute("sap")) break;
    c = c.parentElement;
    d++;
  }
  return d;
}

export const calcFeature = {
  name: "calc",
  begin(pass) {
    pass.calcs = [];
  },
  collect(pass, el, plan, ctx) {
    if (!plan.calcs) return;
    const owner = ctx.item || ctx.state;
    for (const def of plan.calcs) pass.calcs.push({ owner, ownerEl: ctx.ownerEl, name: def.name, entry: def.entry, def, el, ctx });
  },
  compute(pass) {
    const app = pass.app;
    const groups = new Map();
    for (const c of pass.calcs) {
      let g = groups.get(c.owner);
      if (!g) {
        g = { ownerEl: c.ownerEl, list: [] };
        groups.set(c.owner, g);
      }
      g.list.push(c);
    }
    const ordered = [...groups.values()].sort((a, b) => depth(b.ownerEl) - depth(a.ownerEl));
    for (const g of ordered) {
      let sorted;
      try {
        sorted = topoSort(g.list);
      } catch (err) {
        app.diag.error("E07", g.list[0].el, { problem: err.message });
        sorted = g.list;
      }
      for (const c of sorted) {
        try {
          c.owner[c.name] = runWith(c.entry, c.ctx.state, c.ctx.item, c.el, c.ctx.root);
          clearBeacon(c.el);
        } catch (err) {
          c.owner[c.name] = undefined;
          app.diag.error("E24", c.el, { attr: "calc:" + c.name, expr: c.entry.src, problem: String(err.message) });
          setBeacon(c.el, err.sapCode || "E24");
        }
      }
    }
    pass.stats.calcs = pass.calcs.length;
    pass.stats.lists = groups.size;
  },
};
