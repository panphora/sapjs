// The Sap(el) accessor. Returns a live write-through proxy onto the scope or row
// that owns `el`. Reads come from the DOM (carrier or last pass); writes go through
// the one write path (carrier property + synthetic input/change) and schedule a pass.
// $-verbs ($add/$reset/$remove/$move) expose the row/list machinery to handlers.

import {
  nearestScopeEl, nearestItemEl, isInsideDetail, ensureId,
  ownedBind, ownedItems, rowsOf, templateOf, resolveListEl,
  parseStateDecl, parseTyped, serializeTyped,
} from "./dom.js";
import { carrierFor } from "./carrier.js";
import { walkOwned } from "./dom.js";

function ownedScope(scopeEl, name) {
  let found = null;
  walkOwned(scopeEl, (el) => {
    if (!found && el.getAttribute("scope") === name) found = el;
  });
  return found;
}

function declarerOf(fromEl, appRoot, field) {
  let cur = nearestScopeEl(fromEl) || appRoot;
  while (cur) {
    for (const d of parseStateDecl(cur.getAttribute("state") || "")) {
      if (d.name === field) return { el: cur, decl: d };
    }
    if (cur.hasAttribute("app")) break;
    cur = nearestScopeEl(cur.parentElement);
  }
  return null;
}

function inferType(v) {
  if (typeof v === "number") return "num";
  if (typeof v === "boolean") return "bool";
  return "string";
}

export function createAccessor(runtime) {
  // runtime: { appFor(el), schedule(app, trigger), moveInto(parent, el) }

  function contextElFor(el) {
    const appRec = runtime.appFor(el);
    if (!appRec) return null;
    const detailEl = isInsideDetail(el);
    if (detailEl) {
      if (detailEl._sapDetailRow) return { ctxEl: detailEl._sapDetailRow, appRec, isRow: true };
      const sEl = nearestScopeEl(detailEl.parentElement) || appRec.root;
      return { ctxEl: sEl, appRec, isRow: false };
    }
    const itemEl = nearestItemEl(el);
    if (itemEl && itemEl.hasAttribute("item")) return { ctxEl: itemEl, appRec, isRow: true };
    const scopeEl = nearestScopeEl(el) || appRec.root;
    return { ctxEl: scopeEl, appRec, isRow: scopeEl.hasAttribute("item") };
  }

  function Sap(elOrSel) {
    const el = typeof elOrSel === "string" ? document.querySelector(elOrSel) : elOrSel;
    if (!el || el.nodeType !== 1) return null;
    const res = contextElFor(el);
    if (!res) return null;
    return makeProxy(res.ctxEl, res.appRec, res.isRow);
  }

  function readField(ctxEl, appRec, field) {
    const control = ownedBind(ctxEl, field);
    if (control) return carrierFor(control).read();
    const listEl = ownedItems(ctxEl, field);
    if (listEl) return rowsOf(listEl).map((r) => makeProxy(r, appRec, true));
    const sub = ownedScope(ctxEl, field);
    if (sub) return makeProxy(sub, appRec, false);
    const decl = declarerOf(ctxEl, appRec.root, field);
    if (decl) return parseTyped(decl.el.getAttribute(field), decl.decl.type);
    const snap = ctxEl._sapScope;
    return snap ? snap[field] : undefined;
  }

  function setStateAttr(el, field, value, type, appRec) {
    el.setAttribute(field, serializeTyped(value, type));
    runtime.schedule(appRec, "set:" + field);
  }

  function writeField(ctxEl, appRec, field, value) {
    const control = ownedBind(ctxEl, field);
    if (control) {
      carrierFor(control).write(value);
      return;
    }
    let probe = ctxEl;
    while (probe) {
      for (const attr of probe.attributes) {
        if (attr.name === "calc:" + field) {
          appRec.diag.error("E16", probe, { attr: "calc:" + field, problem: `"${field}" is a computed field; computed fields are read-only` });
          return;
        }
      }
      if (probe.hasAttribute("app")) break;
      probe = probe.parentElement;
    }
    const decl = declarerOf(ctxEl, appRec.root, field);
    if (decl) {
      setStateAttr(decl.el, field, value, decl.decl.type, appRec);
      return;
    }
    // auto-declare on the app root (DOM-as-truth: the write creates the field)
    const root = appRec.root;
    const type = inferType(value);
    const decls = root.getAttribute("state") || "";
    const token = type === "string" ? field : `${field}:${type}`;
    root.setAttribute("state", decls ? `${decls} ${token}` : token);
    setStateAttr(root, field, value, type, appRec);
  }

  function freshIds(rootClone) {
    const stamp = (el) => {
      if (el.id) {
        el.id = "";
        ensureId(el, "row");
      }
      if (el.hasAttribute("sap-error")) el.removeAttribute("sap-error");
    };
    rootClone.id = "";
    ensureId(rootClone, "row");
    rootClone.querySelectorAll("[id]").forEach(stamp);
  }

  function doAdd(ctxEl, appRec, name) {
    const listEl = resolveListEl(appRec.root, ctxEl, name);
    if (!listEl) {
      appRec.diag.error("E17", ctxEl, { problem: `cannot resolve a list named "${name}" from here` });
      return null;
    }
    const tmpl = templateOf(listEl);
    if (!tmpl) {
      appRec.diag.error("E17", listEl, { problem: `items="${name}" has no [item template] to clone` });
      return null;
    }
    const clone = tmpl.cloneNode(true);
    clone.removeAttribute("template");
    freshIds(clone);
    listEl.appendChild(clone);
    runtime.schedule(appRec, "trigger-add:" + name);
    return makeProxy(clone, appRec, true);
  }

  function doReset(ctxEl, appRec) {
    walkOwned(ctxEl, (el) => {
      if (el.hasAttribute("bind")) {
        const c = carrierFor(el);
        const def = el.getAttribute("default");
        if (c.kind === "checkbox" || c.kind === "radio") {
          c.write(def != null ? def === "" || def === "true" || el.value === def : el.hasAttribute("checked"));
        } else {
          c.write(def != null ? def : el.getAttribute("value") || "");
        }
      }
    });
    for (const d of parseStateDecl(ctxEl.getAttribute("state") || "")) {
      const dflt = d.default != null ? d.default : d.type === "num" ? "0" : d.type === "bool" ? "false" : "";
      ctxEl.setAttribute(d.name, dflt);
    }
    runtime.schedule(appRec, "trigger-reset");
  }

  function doRemove(ctxEl, appRec) {
    if (!ctxEl.isConnected) throw new Error("stale row handle: $remove() on a removed row");
    ctxEl.remove();
    runtime.schedule(appRec, "trigger-remove");
  }

  function doMove(ctxEl, appRec, target) {
    if (!ctxEl.isConnected) throw new Error("stale row handle: $move() on a removed row");
    let listEl = null;
    if (target && target.nodeType === 1) listEl = target;
    else if (typeof target === "string") listEl = resolveListEl(appRec.root, ctxEl, target);
    if (!listEl) {
      appRec.diag.error("E17", ctxEl, { problem: `$move() cannot resolve target "${target}"` });
      return;
    }
    runtime.moveInto(listEl, ctxEl);
    runtime.schedule(appRec, "trigger-move");
  }

  function rowIndex(ctxEl) {
    const list = ctxEl.parentElement;
    if (!list) return -1;
    return rowsOf(list).indexOf(ctxEl);
  }

  function makeProxy(ctxEl, appRec, isRow) {
    const verbs = {
      get $el() { return ctxEl; },
      get $key() { return ensureId(ctxEl, isRow ? "row" : "scope"); },
      get $index() { return rowIndex(ctxEl); },
      $add(name) { return doAdd(ctxEl, appRec, name); },
      $reset() { doReset(ctxEl, appRec); return proxy; },
      $remove() { doRemove(ctxEl, appRec); },
      $move(target) { doMove(ctxEl, appRec, target); },
      get $appRec() { return appRec; },
    };
    const proxy = new Proxy(verbs, {
      get(t, prop) {
        if (typeof prop === "symbol") return t[prop];
        if (prop[0] === "$") return t[prop];
        return readField(ctxEl, appRec, prop);
      },
      set(t, prop, value) {
        if (typeof prop === "string" && prop[0] === "$") { t[prop] = value; return true; }
        writeField(ctxEl, appRec, prop, value);
        return true;
      },
      has(t, prop) {
        if (typeof prop === "string" && prop[0] === "$") return prop in t;
        return readField(ctxEl, appRec, prop) !== undefined;
      },
    });
    return proxy;
  }

  return { Sap, contextElFor, readField, writeField, makeProxy };
}
