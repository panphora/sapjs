// One full pass: rebuild state from the DOM, compute calc: in dependency order,
// paint write-if-changed, run effects, apply validation. Nothing is retained
// between passes except the compile cache.

import {
  walkOwned, rowsOf, parseStateDecl, parseTyped, ensureId, readTransient,
} from "./dom.js";
import { compile, run, topoSort } from "./compile.js";
import { carrierFor } from "./carrier.js";
import { applyFormat } from "./helpers.js";
import { NATIVE_BOOLEANS, setBeacon, clearBeacon } from "./errors.js";

const NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);

export function runPass(app, opts = {}) {
  if (opts.breaker) {
    app.diag.error("E26", app.root, {
      problem: "recompute loop halted after 50 passes; recent triggers: " + (app._breakerRing || []).join(", "),
    });
    setBeacon(app.root, "loop");
    return;
  }

  const root = app.root;
  const rootObj = {};
  const calcs = [];
  const paints = [];
  const effects = [];
  const invalids = [];
  app.diag.errors = [];

  const rootCtx = { root: rootObj, state: rootObj, item: null, ownerEl: root, projection: false };

  function readState(el, obj) {
    const decls = parseStateDecl(el.getAttribute("state") || "");
    el._sapStateDecls = decls;
    for (const d of decls) {
      if (d.type === "string" && NATIVE_BOOLEAN_SET.has(d.name) && typeof el[d.name] === "boolean") {
        obj[d.name] = el.hasAttribute(d.name); // presence semantics (e.g. <details open>)
        continue;
      }
      if (d.transient) {
        obj[d.name] = readTransient(el, d); // runtime-only; never serialized
        continue;
      }
      let raw = el.getAttribute(d.name);
      if (raw == null) raw = d.default != null ? d.default : d.type === "num" ? "0" : d.type === "bool" ? "false" : "";
      obj[d.name] = parseTyped(raw, d.type);
    }
  }

  function readBindInto(el, ctx) {
    if (!el.hasAttribute("bind")) return;
    const field = el.getAttribute("bind");
    const owner = ctx.item || ctx.state;
    const c = carrierFor(el);
    if (c.kind === "radio") {
      if (!(field in owner)) owner[field] = "";
      if (el.checked) owner[field] = el.value;
    } else {
      owner[field] = c.read();
    }
    if (el.hasAttribute("transient")) {
      el.removeAttribute("value"); // the live property carries it; the file never does
      el.removeAttribute("checked");
    }
  }

  function collectEl(el, ctx) {
    for (const attr of el.attributes) {
      const name = attr.name;
      const val = attr.value;
      if (name.startsWith("calc:")) {
        calcs.push({ owner: ctx.item || ctx.state, ownerEl: ctx.ownerEl, name: name.slice(5), entry: compile(val), el, ctx });
      } else if (name === "text" || name.startsWith("text:")) {
        paints.push({ el, kind: "text", fmt: name.includes(":") ? name.slice(5) : null, entry: compile(val), ctx });
      } else if (name === "show") {
        paints.push({ el, kind: "show", entry: compile(val), ctx });
      } else if (name.startsWith("attr:")) {
        paints.push({ el, kind: "attr", arg: name.slice(5), entry: compile(val), ctx });
      } else if (name.startsWith("class:")) {
        paints.push({ el, kind: "class", arg: name.slice(6), entry: compile(val), ctx });
      } else if (name.startsWith("css:")) {
        paints.push({ el, kind: "css", arg: name.slice(4), entry: compile(val), ctx });
      } else if (name === "effect") {
        effects.push({ el, entry: compile(val, true), ctx });
      } else if (name === "invalid") {
        invalids.push({ el, entry: compile(val), ctx });
      }
    }
    if (ctx.projection && el.hasAttribute("bind")) {
      paints.push({ el, kind: "projection", field: el.getAttribute("bind"), ctx });
    }
  }

  function defineRowMeta(rowObj, rowEl, i) {
    ensureId(rowEl, "row");
    Object.defineProperty(rowObj, "$key", { value: rowEl.id, enumerable: false });
    Object.defineProperty(rowObj, "$index", { value: i, enumerable: false });
    Object.defineProperty(rowObj, "$el", { value: rowEl, enumerable: false });
  }

  function enterScope(el, obj, ctx) {
    readState(el, obj);
    el._sapScope = obj;
    if (!ctx.projection && el.hasAttribute("bind")) readBindInto(el, ctx);
    collectEl(el, ctx);
    if (el.hasAttribute("items")) handleItems(el, obj, ctx);
    else walkScope(el, obj, ctx);
  }

  function walkScope(scopeEl, scopeObj, ctx) {
    walkOwned(scopeEl, (el, boundary) => {
      if (boundary) {
        if (el.hasAttribute("scope")) handleScope(el, scopeObj, ctx);
        else if (el.hasAttribute("items")) {
          collectEl(el, ctx);
          handleItems(el, scopeObj, ctx);
        } else if (el.hasAttribute("detail")) handleDetail(el, scopeObj, ctx);
      } else {
        if (!ctx.projection) readBindInto(el, ctx);
        collectEl(el, ctx);
      }
    });
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
    rowsOf(listEl).forEach((rowEl, i) => {
      const rowObj = {};
      defineRowMeta(rowObj, rowEl, i);
      const rctx = { root: ctx.root, state: ctx.state, item: rowObj, ownerEl: rowEl, projection: ctx.projection };
      enterScope(rowEl, rowObj, rctx);
      arr.push(rowObj);
    });
  }

  function resolvePathValue(path, ctx) {
    const segs = String(path).split(".");
    let o = ctx.state;
    for (const s of segs) o = o == null ? undefined : o[s];
    if (o === undefined) {
      o = ctx.root;
      for (const s of segs) o = o == null ? undefined : o[s];
    }
    return o;
  }

  function handleDetail(el, parentObj, ctx) {
    // A detail's own state= declarations name the key field; it lives on the
    // enclosing scope so the row's set: and the panel's key expr see one field.
    for (const d of parseStateDecl(el.getAttribute("state") || "")) {
      if (!(d.name in parentObj)) {
        let raw = el.getAttribute(d.name);
        if (raw == null) raw = d.default != null ? d.default : d.type === "num" ? "0" : d.type === "bool" ? "false" : "";
        parentObj[d.name] = parseTyped(raw, d.type);
      }
    }
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
    const row = Array.isArray(arr) ? arr.find((r) => r && String(r.$key) === String(keyVal)) : null;
    el._sapDetailRow = row ? row.$el : null;
    if (!row) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    if (el.hidden) el.hidden = false;
    const dctx = { root: ctx.root, state: parentObj, item: row, ownerEl: row.$el, projection: true };
    collectEl(el, dctx);
    walkScope(el, row, dctx);
  }

  // --- intake ---
  enterScope(root, rootObj, rootCtx);

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
        c.owner[c.name] = run(c.entry, { state: c.ctx.state, item: c.ctx.item, el: c.el, root: c.ctx.root });
        clearBeacon(c.el);
      } catch (err) {
        c.owner[c.name] = undefined;
        app.diag.error("E24", c.el, { attr: "calc:" + c.name, expr: c.entry.src, problem: String(err.message) });
        setBeacon(c.el, err.sapCode || "E24");
      }
    }
  }

  // --- paint ---
  let writes = 0;
  for (const p of paints) writes += paintOne(p, app);
  for (const e of effects) runEffect(e, app);
  for (const iv of invalids) runInvalid(iv);

  app._state = rootObj;
  app._stats = {
    fields: Object.keys(rootObj).filter((k) => typeof rootObj[k] !== "function").length,
    calcs: calcs.length,
    paints: paints.length,
    lists: groups.size,
    writes,
  };
  app._lastPass = { trigger: opts.trigger || "refresh", writes };
  if (app._debug) {
    console.log(`sap pass · trigger: ${app._lastPass.trigger} · writes ${writes}/${paints.length}`);
  }
}

function paintAttrName(p) {
  if (p.kind === "text") return p.fmt ? "text:" + p.fmt : "text";
  if (p.kind === "attr") return "attr:" + p.arg;
  if (p.kind === "class") return "class:" + p.arg;
  if (p.kind === "css") return "css:" + p.arg;
  return p.kind;
}

function applyProjection(el, v) {
  if (el === el.ownerDocument.activeElement) return 0; // user is typing here
  const c = carrierFor(el);
  const cur = c.read();
  const nv = v == null ? "" : v;
  if (String(cur) !== String(nv)) {
    c.write(nv, { silent: true });
    return 1;
  }
  return 0;
}

function paintOne(p, app) {
  if (p.kind === "projection") {
    return applyProjection(p.el, p.ctx.item ? p.ctx.item[p.field] : "");
  }
  const ctx = { state: p.ctx.state, item: p.ctx.item, el: p.el, root: p.ctx.root };
  try {
    const value = run(p.entry, ctx);
    const n = applyPaint(p, value);
    clearBeacon(p.el);
    return n;
  } catch (err) {
    app.diag.error(err.sapCode === "E22" ? "E22" : "E24", p.el, {
      attr: paintAttrName(p),
      expr: p.entry && p.entry.src,
      problem: String(err.message),
    });
    setBeacon(p.el, err.sapCode || "E24");
    return 0;
  }
}

function applyPaint(p, value) {
  const el = p.el;
  switch (p.kind) {
    case "text": {
      const s = p.fmt != null ? applyFormat(p.fmt, value) : value == null ? "" : String(value);
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
    case "attr": {
      const a = p.arg;
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
      if (el.classList.contains(p.arg) !== on) {
        el.classList.toggle(p.arg, on);
        return 1;
      }
      return 0;
    }
    case "css": {
      const s = value == null ? "" : String(value);
      if (el.style.getPropertyValue("--" + p.arg) !== s) {
        el.style.setProperty("--" + p.arg, s);
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
    run(e.entry, { state: e.ctx.state, item: e.ctx.item, el: e.el, root: e.ctx.root });
    clearBeacon(e.el);
  } catch (err) {
    app.diag.error("E24", e.el, { attr: "effect", expr: e.entry && e.entry.src, problem: String(err.message) });
    setBeacon(e.el, "E24");
  }
}

function runInvalid(iv) {
  let msg = "";
  try {
    const v = run(iv.entry, { state: iv.ctx.state, item: iv.ctx.item, el: iv.el, root: iv.ctx.root });
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
