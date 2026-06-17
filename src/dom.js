// DOM walking that respects scope boundaries, plus declaration parsing and id stamping.

let idSeq = 0;

export function ensureId(el, prefix = "sap") {
  if (!el.id) el.id = `${prefix}-${(idSeq++).toString(36)}`;
  return el.id;
}

export function isScopeBoundary(el) {
  return el.hasAttribute("scope") || el.hasAttribute("items") || el.hasAttribute("detail");
}

export function isInert(el) {
  return el.hasAttribute("sap-ignore") || el.hasAttribute("template");
}

// Walk descendants that belong to scopeEl's own scope. Stops descent at nested
// boundaries (scope/items/detail) and skips inert subtrees (sap-ignore/template).
// visit(el, isBoundary) is called for every owned element including boundaries.
export function walkOwned(scopeEl, visit) {
  for (const child of scopeEl.children) descend(child);
  function descend(el) {
    if (el.nodeType !== 1) return;
    if (isInert(el)) return;
    const boundary = isScopeBoundary(el);
    visit(el, boundary);
    if (!boundary) for (const c of el.children) descend(c);
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

export function rowsOf(listEl) {
  return [...listEl.children].filter((c) => c.hasAttribute("item") && !c.hasAttribute("template"));
}

export function templateOf(listEl) {
  return [...listEl.children].find((c) => c.hasAttribute("item") && c.hasAttribute("template")) || null;
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
      else if (p === "transient") transient = true;
    }
    out.push({ name, type, default: def, transient });
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

// Transient state fields (state="x:transient") live on a runtime-only property,
// never an attribute, so they drive the app but are stripped from the saved DOM.
// The value attribute is removed on read; the state= declaration itself stays.
export function readTransient(el, decl) {
  const store = el._sapTransient || (el._sapTransient = {});
  if (!(decl.name in store)) {
    let raw = el.getAttribute(decl.name);
    if (raw == null) raw = decl.default != null ? decl.default : decl.type === "num" ? "0" : decl.type === "bool" ? "false" : "";
    store[decl.name] = parseTyped(raw, decl.type);
  }
  if (el.hasAttribute(decl.name)) el.removeAttribute(decl.name);
  return store[decl.name];
}

export function writeTransient(el, decl, value) {
  (el._sapTransient || (el._sapTransient = {}))[decl.name] = value;
  if (el.hasAttribute(decl.name)) el.removeAttribute(decl.name);
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
    return appRoot.querySelector(`[items="${listName}"]`);
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
