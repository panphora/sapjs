// each="expr": a keyed view of any array. Rows are reused, moved and removed, never
// rebuilt, so focus and scroll inside them survive. Rows are editor-ui: generated
// output the file never holds.

import { planOf, drainPlans } from "../plan.js";
import { compile, run, runWith } from "../compile.js";

function placeAfter(parent, node, ref) {
  const before = ref.nextSibling;
  if (node.isConnected && parent.moveBefore) {
    try { parent.moveBefore(node, before); return; } catch { /* fall through */ }
  }
  parent.insertBefore(node, before);
}

// The element whose scope an each= container's rows resolve non-record fields
// in: the nearest ancestor that owns ctx.state, skipping detail panels, whose
// _sapScope is the enclosing scope's object.
function drawnElFor(root, el, stateObj) {
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    if (cur._sapScope === stateObj && !cur.hasAttribute("detail")) return cur;
    if (cur.hasAttribute("sap")) return cur;
  }
  return root;
}

// Reconcile one each= container against its array, by key. Returns how many
// structural changes it made.
function reconcileEach(pass, el, ctx) {
  const app = pass.app;
  el._sapDrawnEl = drawnElFor(pass.root, el, ctx.state);
  let tmpl = null;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.tagName === "TEMPLATE") { tmpl = c; break; }
  const blueprint = tmpl && tmpl.content.children.length === 1 ? tmpl.content.firstElementChild : null;
  if (!blueprint) {
    app.diag.error("E42", el, { attr: "each", problem: "each needs one <template> child with exactly one element root" });
    return 0;
  }
  const src = el.getAttribute("each");
  let list;
  try {
    list = run(compile(src), { state: ctx.state, item: ctx.item, el, root: ctx.root });
  } catch (err) {
    app.diag.error("E24", el, { attr: "each", expr: src, problem: String(err.message) });
    return 0;
  }
  if (!Array.isArray(list)) {
    app.diag.error("E40", el, { attr: "each", expr: src, problem: "each must evaluate to an array; the list keeps its last good rows" });
    return 0;
  }
  const keyEntry = compile(el.getAttribute("key") || "item.$key");
  const keys = [];
  const seen = new Set();
  for (const item of list) {
    let k;
    try {
      k = runWith(keyEntry, ctx.state, item, el, ctx.root);
    } catch {
      k = undefined;
    }
    const ks = k == null ? "" : String(k);
    if (ks === "" || seen.has(ks)) {
      app.diag.error("E41", el, {
        attr: "key", expr: keyEntry.src,
        problem: ks === "" ? "an item has no key; the list keeps its last good rows" : `duplicate key "${ks}"; the list keeps its last good rows`,
      });
      return 0;
    }
    seen.add(ks);
    keys.push(ks);
  }

  const prev = el._sapEach || new Map();
  const next = new Map();
  let changes = 0;
  let after = tmpl;
  keys.forEach((k, i) => {
    let rowEl = prev.get(k);
    if (!rowEl || rowEl.parentElement !== el) {
      rowEl = el.ownerDocument.importNode(blueprint, true);
      const clay = (rowEl.getAttribute("clay") || "").split(/\s+/).filter(Boolean);
      if (!clay.includes("editor-ui")) rowEl.setAttribute("clay", [...clay, "editor-ui"].join(" "));
      rowEl._sapEachRow = true;
      changes++;
    }
    if (rowEl.getAttribute("data-key") !== k) rowEl.setAttribute("data-key", k);
    if (after.nextElementSibling !== rowEl) {
      placeAfter(el, rowEl, after);
      changes++;
    }
    rowEl._sapEachItem = list[i];
    next.set(k, rowEl);
    after = rowEl;
  });
  for (const [k, rowEl] of prev) {
    if (next.get(k) !== rowEl && rowEl.parentElement === el) {
      rowEl.remove();
      changes++;
    }
  }
  el._sapEach = next;
  // Placing a row can run page code (a custom element's connectedCallback) that
  // edits its attributes, so their plans are cleared before the rows are read.
  drainPlans();

  keys.forEach((k, i) => {
    const rowEl = next.get(k);
    const rctx = { root: ctx.root, state: ctx.state, item: list[i], ownerEl: rowEl, projection: false, view: true };
    pass.collectEl(rowEl, planOf(rowEl), rctx);
    pass.walkScope(rowEl, {}, rctx);
  });
  return changes;
}

export const eachFeature = {
  name: "each",
  begin(pass) {
    pass.eachList = [];
  },
  boundary: {
    each(pass, el, plan, scopeObj, ctx) {
      pass.collectEl(el, plan, ctx);
      pass.eachList.push({ el, ctx });
    },
  },
  // Index loop: a nested each inside a row is pushed while the outer one is processed.
  reconcile(pass) {
    let changes = 0;
    for (let i = 0; i < pass.eachList.length; i++) changes += reconcileEach(pass, pass.eachList[i].el, pass.eachList[i].ctx);
    return changes;
  },
};
