// One full pass: rebuild state from the DOM, compute calc: in dependency order,
// paint write-if-changed, run effects, apply validation. Nothing is kept that the
// page does not hold: the compile cache and each element's directive plan are
// rebuilt from attributes whenever the page changes them.

import {
  parseStateDecl, parseTyped, serializeTyped, keyOf, readTransient,
  isPresenceDecl, defaultRaw, ownsField, recordElOf, isComposer,
} from "./dom.js";
import { planOf, dropPlans, beginPlans, endPlans, drainPlans } from "./plan.js";
import { compile, run, runWith, topoSort } from "./compile.js";
import { readControl, writeControl, kindOf } from "./carrier.js";
import { applyFormat } from "./helpers.js";
import { NATIVE_BOOLEANS, setBeacon, clearBeacon } from "./errors.js";
import { withDomMutationPaused } from "./mutation-bridge.js";
import { capability } from "./platform.js";

const NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);

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
  const calcs = [];
  const paints = [];
  const effects = [];
  const invalids = [];
  const pending = [];        // declared defaults missing from the DOM (candidates to materialize)
  const deferredDetails = [];
  const eachList = [];
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
    if (plan.calcs) {
      const owner = ctx.item || ctx.state;
      for (const def of plan.calcs) calcs.push({ owner, ownerEl: ctx.ownerEl, name: def.name, entry: def.entry, def, el, ctx });
    }
    if (plan.paints) {
      for (const def of plan.paints) {
        if (def.kind === "when") whenFields.add(def.field);
        paints.push({ def, el, ctx });
      }
    }
    if (plan.effects) for (const def of plan.effects) effects.push({ def, el, ctx });
    if (plan.invalids) for (const def of plan.invalids) invalids.push({ def, el, ctx });
    if (plan.bind != null && (ctx.view || ctx.projection) && !isComposer(el)) {
      const field = plan.bind;
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
        app.diag.error("E43", el, {
          attr: "bind", expr: field,
          problem: `bind="${field}" inside an each row matches no field of the row's record or of the scope the row is drawn in`,
          fix: "bind a field the record owns (bind, state= or items= on the [item]), or declare it with state= where the list is drawn",
        });
      }
    }
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
      } else if (plan.boundary === "detail") handleDetail(el, scopeObj, ctx);
      else {
        collectEl(el, plan, ctx);
        eachList.push({ el, ctx });
      }
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

  // A detail's own state= declarations name the key field; it lives on the
  // enclosing scope so the row's set: and the panel's key expr see one field.
  // The row lookup waits until the whole tree is read, so a panel placed before
  // its list still finds it.
  function handleDetail(el, parentObj, ctx) {
    for (const d of parseStateDecl(el.getAttribute("state") || "")) {
      if (!(d.name in parentObj)) parentObj[d.name] = isPresenceDecl(el, d) ? el.hasAttribute(d.attr) : resolveDefault(el, d);
    }
    deferredDetails.push({ el, parentObj, ctx });
  }

  function resolveDetail(el, parentObj, ctx) {
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
    collectEl(el, planOf(el), dctx);
    walkScope(el, row, dctx);
  }

  // The element whose scope an each= container's rows resolve non-record fields
  // in: the nearest ancestor that owns ctx.state, skipping detail panels, whose
  // _sapScope is the enclosing scope's object.
  function drawnElFor(el, stateObj) {
    for (let cur = el.parentElement; cur; cur = cur.parentElement) {
      if (cur._sapScope === stateObj && !cur.hasAttribute("detail")) return cur;
      if (cur.hasAttribute("sap")) return cur;
    }
    return root;
  }

  // Reconcile one each= container against its array, by key. Rows are reused,
  // moved and removed, never rebuilt, so focus and scroll inside them survive.
  // Returns how many structural changes it made.
  function reconcileEach(el, ctx) {
    el._sapDrawnEl = drawnElFor(el, ctx.state);
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
      collectEl(rowEl, planOf(rowEl), rctx);
      walkScope(rowEl, {}, rctx);
    });
    return changes;
  }

  // --- intake ---
  enterScope(root, rootObj, rootCtx);

  for (let i = 0; i < deferredDetails.length; i++) {
    const { el, parentObj, ctx } = deferredDetails[i];
    resolveDetail(el, parentObj, ctx);
  }

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

  // --- compute calc: deepest scopes first, topo within each scope ---
  const groups = new Map();
  for (const c of calcs) {
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

  // --- each: reconcile keyed lists now that calc: values exist. Index loop: a
  // nested each inside a row is pushed while the outer one is processed. ---
  let viewChanges = 0;
  for (let i = 0; i < eachList.length; i++) viewChanges += reconcileEach(eachList[i].el, eachList[i].ctx);

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
  for (const e of effects) runEffect(e, app);
  for (const iv of invalids) runInvalid(iv);

  app._state = rootObj;
  app._stats = {
    fields: Object.keys(rootObj).filter((k) => typeof rootObj[k] !== "function").length,
    calcs: calcs.length,
    paints: paints.length,
    lists: groups.size,
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

function paintOne(p, app) {
  const def = p.def;
  const el = p.el;
  if (def.kind === "projection") {
    if (def.from === "drawn") {
      const s = def.field in p.ctx.state ? p.ctx.state : p.ctx.root;
      return applyProjection(el, s[def.field]);
    }
    return applyProjection(el, p.ctx.item ? p.ctx.item[def.field] : "");
  }
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

function runEffect(e, app) {
  try {
    runWith(e.def.entry, e.ctx.state, e.ctx.item, e.el, e.ctx.root);
    clearBeacon(e.el);
  } catch (err) {
    app.diag.error("E24", e.el, { attr: "effect", expr: e.def.entry && e.def.entry.src, problem: String(err.message) });
    setBeacon(e.el, "E24");
  }
}

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

function placeAfter(parent, node, ref) {
  const before = ref.nextSibling;
  if (node.isConnected && parent.moveBefore) {
    try { parent.moveBefore(node, before); return; } catch { /* fall through */ }
  }
  parent.insertBefore(node, before);
}

