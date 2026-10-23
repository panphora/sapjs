// One full pass: rebuild state from the DOM, compute calc: in dependency order,
// paint write-if-changed, run effects, apply validation. Nothing is kept that the
// page does not hold: the compile cache and each element's directive plan are
// rebuilt from attributes whenever the page changes them.
//
// The pass runs in fixed phases: intake, afterIntake, materialize, compute,
// reconcile, paint, afterPaint. Intake and paint are the core. Everything else
// (detail panels, calc:, each= views, projections, effects, validation) is a
// feature the entry registers; the core entry registers none of them.

import {
  serializeTyped, parseTyped, keyOf, readTransient, isPresenceDecl, defaultRaw,
} from "./dom.js";
import { planOf, dropPlans, beginPlans, endPlans } from "./plan.js";
import { runWith } from "./compile.js";
import { readControl, kindOf } from "./carrier.js";
import { applyFormat } from "./helpers.js";
import { NATIVE_BOOLEANS, setBeacon, clearBeacon } from "./errors.js";
import { withDomMutationPaused } from "./mutation-bridge.js";
import { capability } from "./platform.js";

const NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);

const features = [];
const boundaries = {};
const paintKinds = {};

export function registerFeature(feature) {
  if (features.includes(feature)) return;
  features.push(feature);
  if (feature.boundary) Object.assign(boundaries, feature.boundary);
  if (feature.paintKinds) Object.assign(paintKinds, feature.paintKinds);
}

export function runPass(app, opts = {}) {
  if (opts.breaker) {
    app.diag.error("E26", app.root, {
      problem: "recompute loop halted after 50 passes; recent triggers: " + (app._breakerRing || []).join(", "),
    });
    setBeacon(app.root, "loop");
    return;
  }
  // A pass the engine cannot attribute to specific elements (refresh, live sync,
  // undo, mount) re-reads every attribute: it drops every plan first. Every pass then
  // clears the plans of elements whose attributes changed since the last one.
  if (opts.full) dropPlans();
  const plans = beginPlans(app.root);
  // The whole pass runs inside one DOM-mutation pause: every engine-derived write
  // (intake strips, id stamps, default materialization, paints, effects, validity,
  // beacons) is vacuumed away from the mutation bridge so it never schedules another
  // pass, and away from undo/autosave so a single user edit collapses to one entry.
  // No-op standalone with no hub/observer present. See mutation-bridge.js.
  try {
    withDomMutationPaused(() => runPassBody(app, opts));
  } finally {
    endPlans(plans);
  }
  if (app._viewsChanged) {
    app._viewsChanged = false;
    app.root.dispatchEvent(new CustomEvent("sap:views-updated", { bubbles: true }));
  }
}

function runPassBody(app, opts) {
  const root = app.root;
  const rootObj = {};
  const paints = [];
  const pending = [];        // declared defaults missing from the DOM (candidates to materialize)
  const whenFields = new Set(); // field names a show-when/option visibility verb reads
  app.diag.errors = [];

  const rootCtx = { root: rootObj, state: rootObj, item: null, ownerEl: root, projection: false };

  // Read a declared field's value, falling back to its default. When the bare
  // attribute is absent, record the default so it can be materialized to the DOM
  // after intake — but only if a visibility verb references the field, so the CSS
  // floor and show-when can match it before any write. Non-visibility fields are
  // never materialized, keeping this purely additive for existing apps.
  function resolveDefault(el, d) {
    const attr = d.attr || d.name;
    let raw = el.getAttribute(attr);
    if (raw == null) {
      raw = defaultRaw(d);
      pending.push({ el, name: d.name, attr, value: serializeTyped(parseTyped(raw, d.type), d.type) });
    }
    return parseTyped(raw, d.type);
  }

  function readState(el, plan, obj) {
    const decls = plan.decls;
    if (!decls) return;
    for (const d of decls) {
      if (d.transient) {
        obj[d.name] = readTransient(el, d); // runtime-only; never serialized
        continue;
      }
      if (isPresenceDecl(el, d)) {
        obj[d.name] = el.hasAttribute(d.attr); // presence: <details open>, data-done
        continue;
      }
      obj[d.name] = resolveDefault(el, d);
    }
  }

  function readBindInto(el, plan, ctx) {
    const field = plan.bind;
    const owner = ctx.item || ctx.state;
    const kind = kindOf(el);
    if (kind === "radio") {
      if (!(field in owner)) owner[field] = "";
      if (el.checked) owner[field] = el.value;
    } else {
      owner[field] = readControl(el, kind);
    }
    if (plan.transient) {
      el.removeAttribute("value"); // the live property carries it; the file never does
      el.removeAttribute("checked");
    }
  }

  function collectEl(el, plan, ctx) {
    if (plan.paints) {
      for (const def of plan.paints) {
        if (def.kind === "when") whenFields.add(def.field);
        paints.push({ def, el, ctx });
      }
    }
    for (const f of features) if (f.collect) f.collect(pass, el, plan, ctx);
  }

  function defineRowMeta(rowObj, rowEl, i) {
    Object.defineProperty(rowObj, "$key", { value: keyOf(rowEl, "row"), enumerable: false });
    Object.defineProperty(rowObj, "$index", { value: i, enumerable: false });
    Object.defineProperty(rowObj, "$el", { value: rowEl, enumerable: false });
  }

  function enterScope(el, obj, ctx) {
    const plan = planOf(el);
    readState(el, plan, obj);
    el._sapScope = obj;
    if (!ctx.projection && plan.bind != null) readBindInto(el, plan, ctx);
    collectEl(el, plan, ctx);
    if (plan.items) handleItems(el, obj, ctx);
    else walkScope(el, obj, ctx);
  }

  function walkScope(scopeEl, scopeObj, ctx) {
    for (let el = scopeEl.firstElementChild; el; el = el.nextElementSibling) visitOwned(el, scopeObj, ctx);
  }

  // Visit one element that belongs to the enclosing scope. Descent stops at nested
  // boundaries (scope/items/detail/each) and skips inert subtrees (sap-ignore/template/cms-template).
  function visitOwned(el, scopeObj, ctx) {
    const plan = planOf(el);
    if (plan.inert) return;
    if (plan.boundary) {
      if (plan.boundary === "scope") handleScope(el, scopeObj, ctx);
      else if (plan.boundary === "items") {
        collectEl(el, plan, ctx);
        handleItems(el, scopeObj, ctx);
      } else boundaries[plan.boundary](pass, el, plan, scopeObj, ctx);
      return;
    }
    if (!ctx.projection && !ctx.view && plan.bind != null) readBindInto(el, plan, ctx);
    collectEl(el, plan, ctx);
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) visitOwned(c, scopeObj, ctx);
  }

  function handleScope(el, parentObj, ctx) {
    const name = el.getAttribute("scope");
    const childObj = {};
    parentObj[name] = childObj;
    const cctx = { root: ctx.root, state: childObj, item: null, ownerEl: el, projection: ctx.projection };
    enterScope(el, childObj, cctx);
  }

  function handleItems(listEl, parentObj, ctx) {
    const name = listEl.getAttribute("items");
    const arr = [];
    parentObj[name] = arr;
    listEl._sapList = arr;
    let i = 0;
    for (let rowEl = listEl.firstElementChild; rowEl; rowEl = rowEl.nextElementSibling) {
      const rp = planOf(rowEl);
      if (!rp.item || rp.template || rowEl.hasAttribute("cms-template")) continue;
      const rowObj = {};
      defineRowMeta(rowObj, rowEl, i);
      const rctx = { root: ctx.root, state: ctx.state, item: rowObj, ownerEl: rowEl, projection: ctx.projection };
      enterScope(rowEl, rowObj, rctx);
      arr.push(rowObj);
      i++;
    }
  }

  const pass = {
    app, root, rootObj, paints, stats: { calcs: 0, lists: 0 },
    resolveDefault, collectEl, walkScope,
  };

  for (const f of features) if (f.begin) f.begin(pass);

  // --- intake ---
  enterScope(root, rootObj, rootCtx);

  for (const f of features) if (f.afterIntake) f.afterIntake(pass);

  // --- materialize defaults a visibility verb references, so the CSS floor
  // (hyperclayjs optionVisibility) and our own show-when can match them before any
  // write. Not counted as paints: this completes the file, it is not a user edit.
  // Only whenFields are touched, so apps without show-when/option see no DOM change.
  // (The whole-pass mutation pause keeps these writes off undo/autosave.) ---
  if (pending.length && whenFields.size) {
    for (const w of pending) {
      if (whenFields.has(w.attr) && w.el.getAttribute(w.attr) == null) {
        w.el.setAttribute(w.attr, w.value);
      }
    }
  }

  for (const f of features) if (f.compute) f.compute(pass);

  let viewChanges = 0;
  for (const f of features) if (f.reconcile) viewChanges += f.reconcile(pass);

  // --- paint ---
  // Engine-derived output (text/hidden/attr/class/css), effects, and validity
  // complete the file from current state; they are not user edits. The whole-pass
  // mutation pause (runPass) keeps these writes off the bridge, undo, and autosave,
  // so one user edit does not spawn N undoable/dirtying derived writes: undo restores
  // the source attribute and we re-derive on undo/redo (platform.js), so a single
  // undo reverts the action and its derived effects together.
  let writes = 0;
  let viewWrites = viewChanges;
  for (const p of paints) {
    const n = paintOne(p, app);
    if (p.ctx.view) viewWrites += n;
    else writes += n;
  }
  for (const f of features) if (f.afterPaint) f.afterPaint(pass);

  app._state = rootObj;
  app._stats = {
    fields: Object.keys(rootObj).filter((k) => typeof rootObj[k] !== "function").length,
    calcs: pass.stats.calcs,
    paints: paints.length,
    lists: pass.stats.lists,
    writes,
    viewWrites,
  };
  app._viewsChanged = viewWrites > 0;
  app._lastPass = { trigger: opts.trigger || "refresh", writes };
  if (app._debug) {
    console.log(`sap pass · trigger: ${app._lastPass.trigger} · writes ${writes}/${paints.length}`);
  }
}

function paintAttrName(def) {
  if (def.kind === "text") return def.fmt ? "text:" + def.fmt : "text";
  if (def.kind === "attr") return "attr:" + def.arg;
  if (def.kind === "class") return "class:" + def.arg;
  if (def.kind === "css") return "css:" + def.arg;
  if (def.kind === "when") return (def.match === "hide" ? "hide-when:" : def.match === "show-not" ? "option-not:" : "show-when:") + def.field;
  return def.kind;
}

// Walk self + ancestors for an element carrying `field`, matching optionVisibility's
// "inside a matching scope" semantics. notMode flips to "present but not a value".
function nearestMode(el, field, values, notMode) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (cur.hasAttribute && cur.hasAttribute(field)) {
      const inList = values.includes(cur.getAttribute(field));
      if (notMode ? !inList : inList) return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

function paintOne(p, app) {
  const def = p.def;
  const el = p.el;
  const custom = paintKinds[def.kind];
  if (custom) return custom(p, app);
  if (def.kind === "when") {
    return applyPaint(def, el, null); // visibility is read from the DOM, not an expression
  }
  try {
    const value = runWith(def.entry, p.ctx.state, p.ctx.item, el, p.ctx.root);
    const n = applyPaint(def, el, value);
    clearBeacon(el);
    return n;
  } catch (err) {
    app.diag.error(err.sapCode === "E22" ? "E22" : "E24", el, {
      attr: paintAttrName(def),
      expr: def.entry && def.entry.src,
      problem: String(err.message),
    });
    setBeacon(el, err.sapCode || "E24");
    return 0;
  }
}

function applyPaint(def, el, value) {
  switch (def.kind) {
    case "text": {
      const s = def.fmt != null ? applyFormat(def.fmt, value) : value == null ? "" : String(value);
      if (el.textContent !== s) {
        el.textContent = s;
        return 1;
      }
      return 0;
    }
    case "show": {
      const hide = !value;
      if (el.hidden !== hide) {
        el.hidden = hide;
        return 1;
      }
      return 0;
    }
    case "when": {
      const ov = capability("optionVisibility");
      if (ov && ov._started) {
        // The CSS floor owns visibility now; clear any hidden we set pre-floor.
        if (el._sapWhen && el.hidden) { el.hidden = false; el._sapWhen = false; return 1; }
        return 0;
      }
      let visible;
      if (def.match === "hide") visible = !nearestMode(el, def.field, def.values, false);
      else if (def.match === "show-not") visible = nearestMode(el, def.field, def.values, true);
      else visible = nearestMode(el, def.field, def.values, false);
      el._sapWhen = true;
      const hide = !visible;
      if (el.hidden !== hide) {
        el.hidden = hide;
        return 1;
      }
      return 0;
    }
    case "attr": {
      const a = def.arg;
      if ((a === "checked" || a === "selected") && typeof el[a] === "boolean" && !el.hasAttribute("bind") && !el.closest("select[bind]")) {
        let n = 0;
        if (el[a] !== !!value) {
          el[a] = !!value;
          n = 1;
        }
        if (!!value !== el.hasAttribute(a)) {
          if (value) el.setAttribute(a, "");
          else el.removeAttribute(a);
          n = 1;
        }
        return n;
      }
      if (NATIVE_BOOLEAN_SET.has(a)) {
        const has = el.hasAttribute(a);
        if (value && !has) {
          el.setAttribute(a, "");
          return 1;
        }
        if (!value && has) {
          el.removeAttribute(a);
          return 1;
        }
        return 0;
      }
      const s = typeof value === "boolean" ? String(value) : value == null ? "" : String(value);
      if (el.getAttribute(a) !== s) {
        el.setAttribute(a, s);
        return 1;
      }
      return 0;
    }
    case "class": {
      const on = !!value;
      if (el.classList.contains(def.arg) !== on) {
        el.classList.toggle(def.arg, on);
        return 1;
      }
      return 0;
    }
    case "css": {
      const s = value == null ? "" : String(value);
      if (el.style.getPropertyValue("--" + def.arg) !== s) {
        el.style.setProperty("--" + def.arg, s);
        return 1;
      }
      return 0;
    }
    default:
      return 0;
  }
}
