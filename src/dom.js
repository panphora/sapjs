// DOM walking that respects scope boundaries, plus declaration parsing and row keys.

import { NATIVE_BOOLEANS } from "./errors.js";

const NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);
const NATIVE_PROPS = { readonly: "readOnly", novalidate: "noValidate" };

let idSeq = 0;
const runtimeKeys = new WeakMap();

// A row's identity, read without writing: data-id, then id, then a key that lives
// only in this tab. Mount must never stamp attributes onto saved records.
export function keyOf(el, prefix = "sap") {
  const dataId = el.getAttribute("data-id");
  if (dataId) return dataId;
  if (el.id) return el.id;
  let key = runtimeKeys.get(el);
  if (!key) {
    key = `${prefix}-${(idSeq++).toString(36)}`;
    runtimeKeys.set(el, key);
  }
  return key;
}

// A fresh id for a row being created, unique among both id and data-id in the document.
export function mintId(doc, prefix = "row") {
  for (;;) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
    if (!doc.getElementById(id) && !doc.querySelector(`[data-id="${id}"]`)) return id;
  }
}

export function isScopeBoundary(el) {
  return el.hasAttribute("scope") || el.hasAttribute("items") || el.hasAttribute("detail") || el.hasAttribute("each");
}

export function isInert(el) {
  return el.tagName === "TEMPLATE" || el.hasAttribute("sap-ignore") || el.hasAttribute("template") || el.hasAttribute("cms-template");
}

// Walk descendants that belong to scopeEl's own scope. Stops descent at nested
// boundaries (scope/items/detail) and skips inert subtrees (sap-ignore/template/cms-template).
// visit(el, isBoundary) is called for every owned element including boundaries.
export function walkOwned(scopeEl, visit) {
  for (let child = scopeEl.firstElementChild; child; child = child.nextElementSibling) descend(child);
  function descend(el) {
    if (isInert(el)) return;
    const boundary = isScopeBoundary(el);
    visit(el, boundary);
    if (!boundary) for (let c = el.firstElementChild; c; c = c.nextElementSibling) descend(c);
  }
}

export function nearestScopeEl(el) {
  let cur = el;
  while (cur) {
    if (cur.hasAttribute("sap") || cur.hasAttribute("scope") || cur.hasAttribute("item") || cur.hasAttribute("detail")) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

// The generated each-row an element sits in, if that row is nearer than any [item]
// record or the app root. Rows are marked by the pass that creates them.
export function nearestViewRow(el) {
  for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
    if (cur._sapEachRow) return cur;
    if (cur.hasAttribute("item") || cur.hasAttribute("sap")) return null;
  }
  return null;
}

export function nearestAppEl(el) {
  let cur = el;
  while (cur) {
    if (cur.hasAttribute && cur.hasAttribute("sap")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function nearestItemEl(el) {
  let cur = el;
  while (cur) {
    if (cur.hasAttribute("detail")) return cur; // a detail panel resolves like a row
    if (cur.hasAttribute("item")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function isInsideDetail(el) {
  let cur = el;
  while (cur) {
    if (cur.hasAttribute("detail")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function ownedBind(scopeEl, field) {
  if (scopeEl.hasAttribute("item") && scopeEl.getAttribute("bind") === field) return scopeEl;
  let found = null;
  walkOwned(scopeEl, (el) => {
    if (!found && el.getAttribute("bind") === field) found = el;
  });
  return found;
}

export function ownedItems(scopeEl, name) {
  let found = null;
  walkOwned(scopeEl, (el) => {
    if (!found && el.getAttribute("items") === name) found = el;
  });
  return found;
}

// A field an [item] record owns: a bound control, a nested items= list, or a
// state= declaration on the record element itself.
export function ownsField(rowEl, field) {
  if (!rowEl || rowEl.nodeType !== 1 || !rowEl.hasAttribute("item")) return false;
  if (ownedBind(rowEl, field) || ownedItems(rowEl, field)) return true;
  return parseStateDecl(rowEl.getAttribute("state") || "").some((d) => d.name === field);
}

// The [item] element an each= row's data came from, when the row stands for a record.
export function recordElOf(item) {
  const el = item && item.$el;
  return el && el.nodeType === 1 && el.isConnected && el.hasAttribute("item") ? el : null;
}

// A control that composes a new row; never a projection of an existing one.
export function isComposer(el) {
  return !!el.closest("form[trigger-add]");
}

export function rowsOf(listEl) {
  const rows = [];
  for (let c = listEl.firstElementChild; c; c = c.nextElementSibling) {
    if (c.hasAttribute("item") && !c.hasAttribute("template") && !c.hasAttribute("cms-template")) rows.push(c);
  }
  return rows;
}

// The shared <template items="NAME"> of one app, ignoring templates that belong to
// a nested app.
export function sharedTemplate(appRoot, name) {
  if (!appRoot || !name) return null;
  const t = [...appRoot.querySelectorAll(`template[items="${name}"]`)].find((x) => x.closest("[sap]") === appRoot);
  const blueprint = t && t.content.firstElementChild;
  return blueprint && blueprint.hasAttribute("item") ? blueprint : null;
}

// A list's own [item template] row, else the app's shared <template items="NAME">.
export function templateOf(listEl) {
  for (let c = listEl.firstElementChild; c; c = c.nextElementSibling) {
    if (c.hasAttribute("item") && c.hasAttribute("template")) return c;
  }
  return sharedTemplate(listEl.closest("[sap]"), listEl.getAttribute("items"));
}

export function parseStateDecl(str) {
  const out = [];
  if (!str) return out;
  for (const raw of str.trim().split(/\s+/)) {
    if (!raw) continue;
    let token = raw;
    let def;
    const eq = token.indexOf("=");
    if (eq >= 0) {
      def = token.slice(eq + 1);
      token = token.slice(0, eq);
    }
    const parts = token.split(":");
    const name = parts[0];
    let type = "string";
    let transient = false;
    for (const p of parts.slice(1)) {
      if (p === "num") type = "num";
      else if (p === "bool") type = "bool";
      else if (p === "presence") type = "presence";
      else if (p === "transient") transient = true;
    }
    const attr = name;
    const key = attr.startsWith("data-") && attr.length > 5
      ? attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      : attr;
    out.push({ name: key, attr, type, default: def, transient });
  }
  return out;
}

export function parseTyped(value, type) {
  if (type === "num") {
    if (value == null || value === "") return 0;
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }
  if (type === "bool") return value === "true" || value === "" || value === "1";
  return value == null ? "" : value;
}

export function serializeTyped(value, type) {
  if (type === "bool") return value ? "true" : "false";
  return value == null ? "" : String(value);
}

// An HTML boolean attribute this element really implements (details open, input
// disabled, form novalidate). The browser reads it by presence.
export function isNativeBoolean(el, attr) {
  return NATIVE_BOOLEAN_SET.has(attr) && typeof el[NATIVE_PROPS[attr] || attr] === "boolean";
}

// A declared field carried by attribute presence: present is true, absent is false.
export function isPresenceDecl(el, d) {
  return d.type === "presence" || (d.type !== "num" && isNativeBoolean(el, d.attr || d.name));
}

// The raw text a value-encoded field reads when its attribute is absent.
export function defaultRaw(d) {
  return d.default != null ? d.default : d.type === "num" ? "0" : d.type === "bool" ? "false" : "";
}

// A declared, non-transient field's current value.
export function readDeclared(el, d) {
  const attr = d.attr || d.name;
  if (isPresenceDecl(el, d)) return el.hasAttribute(attr);
  const raw = el.getAttribute(attr);
  return parseTyped(raw != null ? raw : defaultRaw(d), d.type);
}

// The value a reset restores. A presence field's default is a reset target only.
export function declaredDefault(el, d) {
  if (isPresenceDecl(el, d)) return d.default != null ? parseTyped(d.default, "bool") : false;
  return parseTyped(defaultRaw(d), d.type);
}

// Write a declared, non-transient field. Presence fields add or remove the
// attribute; every other type writes its serialized text.
export function writeDeclared(el, d, value) {
  const attr = d.attr || d.name;
  if (isPresenceDecl(el, d)) {
    if (value) {
      if (!el.hasAttribute(attr)) el.setAttribute(attr, "");
    } else if (el.hasAttribute(attr)) {
      el.removeAttribute(attr);
    }
    return;
  }
  el.setAttribute(attr, serializeTyped(value, d.type));
}

// Transient state fields (state="x:transient") live on a runtime-only property,
// never an attribute, so they drive the app but are stripped from the saved DOM.
// The value attribute is removed on read; the state= declaration itself stays.
export function readTransient(el, decl) {
  const attr = decl.attr || decl.name;
  const store = el._sapTransient || (el._sapTransient = {});
  if (!(decl.name in store)) {
    let raw = el.getAttribute(attr);
    if (raw == null) raw = defaultRaw(decl);
    store[decl.name] = parseTyped(raw, decl.type);
  }
  if (el.hasAttribute(attr)) el.removeAttribute(attr);
  return store[decl.name];
}

export function writeTransient(el, decl, value) {
  const attr = decl.attr || decl.name;
  (el._sapTransient || (el._sapTransient = {}))[decl.name] = value;
  if (el.hasAttribute(attr)) el.removeAttribute(attr);
}

// Find the list element a path points at, resolving nearest-scope-first.
// "cards" -> nearest owned items=cards; "doing.cards" -> [scope=doing] > [items=cards].
export function resolveListEl(appRoot, fromEl, path) {
  const segs = String(path).split(".");
  const listName = segs[segs.length - 1];
  if (segs.length === 1) {
    const up = findItemsUp(fromEl, listName);
    if (up) return up;
    if (appRoot.getAttribute("items") === listName) return appRoot;
    return appRoot.querySelector(`[items="${listName}"]:not(template)`);
  }
  const scopeName = segs[segs.length - 2];
  const scopeEl = [...appRoot.querySelectorAll(`[scope="${scopeName}"]`)].find((s) =>
    ownedItems(s, listName)
  );
  return scopeEl ? ownedItems(scopeEl, listName) : null;
}

function findItemsUp(fromEl, name) {
  let scope = nearestScopeEl(fromEl);
  while (scope) {
    if (scope.getAttribute("items") === name) return scope; // the scope element is itself the list
    const found = ownedItems(scope, name);
    if (found) return found;
    scope = nearestScopeEl(scope.parentElement);
  }
  return null;
}
