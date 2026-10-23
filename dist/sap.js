var Sap = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/sap.js
  var sap_exports = {};
  __export(sap_exports, {
    Sap: () => Sap,
    default: () => sap_default,
    mount: () => mount,
    mountAll: () => mountAll,
    runtime: () => runtime
  });

  // src/scheduler.js
  var MAX_PASSES = 50;
  function createScheduler(runPass2) {
    let queued = false;
    const dirty = /* @__PURE__ */ new Set();
    const ring = [];
    function note(trigger) {
      if (!trigger) return;
      ring.push(trigger);
      if (ring.length > 8) ring.shift();
    }
    function schedule(app, trigger) {
      note(trigger);
      if (app._broken) return;
      dirty.add(app);
      if (queued) return;
      queued = true;
      queueMicrotask(drain);
    }
    function drain() {
      queued = false;
      const apps = [...dirty];
      dirty.clear();
      for (const app of apps) runWithBreaker(app);
    }
    function runWithBreaker(app, full = false) {
      if (app._broken) return;
      app._passes = (app._passes || 0) + 1;
      if (app._passes > MAX_PASSES) {
        app._broken = true;
        app._breakerRing = ring.slice();
        runPass2(app, { breaker: true });
        return;
      }
      if (!app._resetArmed) {
        app._resetArmed = true;
        setTimeout(() => {
          app._passes = 0;
          app._resetArmed = false;
        }, 0);
      }
      runPass2(app, full ? { full: true } : {});
    }
    function runNow(app, trigger) {
      note(trigger);
      runWithBreaker(app, true);
    }
    function rearm(app) {
      app._broken = false;
      app._passes = 0;
    }
    return { schedule, runNow, rearm, ring };
  }

  // src/errors.js
  var REGISTRY = {
    E01: { slug: "foreign-dialect", behavior: "HALT" },
    E02: { slug: "moustaches-in-text", behavior: "HALT" },
    E04: { slug: "duplicate-declaration", behavior: "HALT" },
    E05: { slug: "reserved-name", behavior: "HALT" },
    E06: { slug: "global-html-name", behavior: "HALT" },
    E07: { slug: "calc-cycle", behavior: "ERR" },
    E08: { slug: "expression-syntax", behavior: "HALT" },
    E10: { slug: "orphan-item", behavior: "HALT" },
    E12: { slug: "unknown-state-key", behavior: "ERR" },
    E15: { slug: "write-to-undeclared-key", behavior: "ERR" },
    E16: { slug: "write-to-computed-field", behavior: "ERR" },
    E17: { slug: "unresolvable-action-target", behavior: "HALT" },
    E18: { slug: "paint-on-form-control", behavior: "HALT" },
    E20: { slug: "bind-on-non-control", behavior: "HALT" },
    E22: { slug: "format-type", behavior: "ERR" },
    E24: { slug: "runtime-expression-throw", behavior: "ERR" },
    E26: { slug: "circuit-breaker", behavior: "HALT" },
    E30: { slug: "attr-on-bound-control", behavior: "HALT" },
    E31: { slug: "password-without-transient", behavior: "HALT" },
    E32: { slug: "file-bind", behavior: "HALT" },
    E33: { slug: "dialog-state-open", behavior: "HALT" },
    E34: { slug: "transient-persist-collision", behavior: "HALT" },
    E35: { slug: "presence-state-misuse", behavior: "HALT" },
    E40: { slug: "each-not-array", behavior: "ERR" },
    E41: { slug: "each-bad-key", behavior: "ERR" },
    E42: { slug: "each-template", behavior: "ERR" },
    E43: { slug: "bind-in-each-row", behavior: "ERR" },
    E50: { slug: "needs-full-sapjs", behavior: "HALT" },
    W03: { slug: "unknown-colon-attribute", behavior: "WARN" },
    W04: { slug: "expression-in-when", behavior: "WARN" },
    W30: { slug: "nonzero-mount-writes", behavior: "WARN" },
    W31: { slug: "detail-dialog-saved-open", behavior: "WARN" }
  };
  var NATIVE_BOOLEANS = [
    "disabled",
    "readonly",
    "required",
    "checked",
    "selected",
    "multiple",
    "open",
    "inert",
    "autofocus",
    "novalidate",
    "hidden"
  ];
  var HTML_GLOBALS = /* @__PURE__ */ new Set([
    "title",
    "style",
    "hidden",
    "lang",
    "dir",
    "translate",
    "class",
    "id",
    "nonce",
    "autofocus",
    "tabindex",
    "contenteditable",
    "spellcheck",
    "draggable",
    "role",
    "slot",
    "part",
    "name",
    "value",
    "type",
    "itemscope",
    "itemtype",
    "itemid",
    "itemprop",
    "itemref"
  ]);
  var RESERVED = /* @__PURE__ */ new Set([
    "sap",
    "scope",
    "items",
    "item",
    "template",
    "bind",
    "calc",
    "text",
    "show",
    "attr",
    "set",
    "trigger",
    "move",
    "sort",
    "detail",
    "each",
    "effect",
    "invalid",
    "confirm",
    "transient",
    "default",
    "persist",
    "sortable",
    // editmode is a hyperclayjs platform prefix (editmode:onclick), reserved so a
    // co-loaded admin attribute never collides with a Sap state field name.
    "editmode"
  ]);
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "?";
    if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
    const parts = [];
    let cur = el;
    let depth2 = 0;
    while (cur && cur.nodeType === 1 && depth2 < 4) {
      let seg = cur.tagName.toLowerCase();
      if (cur.hasAttribute("sap")) seg += "[sap]";
      else if (cur.parentElement) {
        let count2 = 0;
        let index = 0;
        for (let c = cur.parentElement.firstElementChild; c; c = c.nextElementSibling) {
          if (c.tagName !== cur.tagName) continue;
          count2++;
          if (c === cur) index = count2;
        }
        if (count2 > 1) seg += `:nth-of-type(${index})`;
      }
      parts.unshift(seg);
      if (cur.hasAttribute("sap")) break;
      cur = cur.parentElement;
      depth2++;
    }
    return parts.join(" > ");
  }
  function teachForAttr(name) {
    const n2 = name.toLowerCase();
    if (/^x-text$|^x-html$/.test(n2)) return `use text="state.x" (Sap paints text only)`;
    if (/^x-show$|^v-show$|^v-if$/.test(n2)) return `use show="expr" (toggles native hidden)`;
    if (/^x-model$|^v-model$/.test(n2)) return `use bind="field"`;
    if (/^@|^x-on:|^v-on:|^on:/.test(n2)) return `use native onclick + Sap(this) (no event directive)`;
    if (/^:|^x-bind:class$|^v-bind:class$/.test(n2)) return `use class:NAME="expr" or attr:NAME="expr"`;
    if (/^x-for$|^v-for$/.test(n2)) return `use items="name" on the container and item template on the row`;
    if (/^x-data$/.test(n2)) return `declare state with state= / bind / items (no JS state object)`;
    if (/^x-init$/.test(n2)) return `use a <script> or onclick + Sap(this)`;
    if (/^bind:/.test(n2)) return `use bind="field"; one-way paint is attr:NAME="expr"`;
    if (/^x-/.test(n2) || /^v-/.test(n2)) return `this is a foreign-dialect attribute; Sap has no x-/v- attributes`;
    return null;
  }
  var Diagnostics = class {
    constructor(appName) {
      this.appName = appName;
      this.errors = [];
      this.warnings = [];
      this.halted = false;
      this.haltReason = null;
    }
    block(code, el, info = {}) {
      const slug = (REGISTRY[code] || {}).slug || "error";
      const rec = {
        code,
        slug,
        el: cssPath(el),
        attr: info.attr || null,
        expr: info.expr || null,
        key: info.key || null,
        problem: info.problem || "",
        didYouMean: info.didYouMean || null,
        fix: info.fix || null,
        phase: info.phase || "runtime"
      };
      const out = ["\n" + (code[0] === "W" ? "sap \u26A0 " : "sap \u2717 ") + code + " " + slug];
      out.push(`  at ${rec.el}${rec.attr ? ` \u2014 ${rec.attr}="${rec.expr ?? ""}"` : ""}`);
      if (rec.problem) out.push(`  problem: ${rec.problem}`);
      if (rec.didYouMean) out.push(`  did you mean: ${rec.didYouMean}`);
      if (rec.fix) out.push(`  fix: ${rec.fix}`);
      (code[0] === "W" ? console.warn : console.error)(out.join("\n"));
      return rec;
    }
    error(code, el, info = {}) {
      const rec = this.block(code, el, info);
      this.errors.push(rec);
      return rec;
    }
    warn(code, el, info = {}) {
      const rec = this.block(code, el, info);
      this.warnings.push(rec);
      return rec;
    }
    report() {
      return {
        ok: this.errors.length === 0 && !this.halted,
        app: this.appName,
        halted: this.halted,
        haltReason: this.haltReason,
        errors: this.errors.slice(),
        warnings: this.warnings.slice()
      };
    }
  };
  function setBeacon(el, code) {
    if (el && el.getAttribute("sap-error") !== code) el.setAttribute("sap-error", code);
  }
  function clearBeacon(el) {
    if (el && el.hasAttribute("sap-error")) el.removeAttribute("sap-error");
  }
  function didYouMean(name, candidates) {
    let best = null;
    let bestD = 3;
    for (const c of candidates) {
      const d = lev(name, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
  function lev(a, b) {
    const m = a.length;
    const n2 = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n2).fill(0)]);
    for (let j = 0; j <= n2; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n2; j++)
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
    return dp[m][n2];
  }

  // src/dom.js
  var NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);
  var NATIVE_PROPS = { readonly: "readOnly", novalidate: "noValidate" };
  var idSeq = 0;
  var runtimeKeys = /* @__PURE__ */ new WeakMap();
  function keyOf(el, prefix = "sap") {
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
  function mintId(doc, prefix = "row") {
    for (; ; ) {
      const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      if (!doc.getElementById(id) && !doc.querySelector(`[data-id="${id}"]`)) return id;
    }
  }
  function isScopeBoundary(el) {
    return el.hasAttribute("scope") || el.hasAttribute("items") || el.hasAttribute("detail") || el.hasAttribute("each");
  }
  function isInert(el) {
    return el.tagName === "TEMPLATE" || el.hasAttribute("sap-ignore") || el.hasAttribute("template") || el.hasAttribute("cms-template");
  }
  function walkOwned(scopeEl, visit) {
    for (let child = scopeEl.firstElementChild; child; child = child.nextElementSibling) descend(child);
    function descend(el) {
      if (isInert(el)) return;
      const boundary = isScopeBoundary(el);
      visit(el, boundary);
      if (!boundary) for (let c = el.firstElementChild; c; c = c.nextElementSibling) descend(c);
    }
  }
  function nearestScopeEl(el) {
    let cur = el;
    while (cur) {
      if (cur.hasAttribute("sap") || cur.hasAttribute("scope") || cur.hasAttribute("item") || cur.hasAttribute("detail")) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }
  function nearestViewRow(el) {
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (cur._sapEachRow) return cur;
      if (cur.hasAttribute("item") || cur.hasAttribute("sap")) return null;
    }
    return null;
  }
  function nearestItemEl(el) {
    let cur = el;
    while (cur) {
      if (cur.hasAttribute("detail")) return cur;
      if (cur.hasAttribute("item")) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function isInsideDetail(el) {
    let cur = el;
    while (cur) {
      if (cur.hasAttribute("detail")) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function ownedBind(scopeEl, field) {
    if (scopeEl.hasAttribute("item") && scopeEl.getAttribute("bind") === field) return scopeEl;
    let found = null;
    walkOwned(scopeEl, (el) => {
      if (!found && el.getAttribute("bind") === field) found = el;
    });
    return found;
  }
  function ownedItems(scopeEl, name) {
    let found = null;
    walkOwned(scopeEl, (el) => {
      if (!found && el.getAttribute("items") === name) found = el;
    });
    return found;
  }
  function ownsField(rowEl, field) {
    if (!rowEl || rowEl.nodeType !== 1 || !rowEl.hasAttribute("item")) return false;
    if (ownedBind(rowEl, field) || ownedItems(rowEl, field)) return true;
    return parseStateDecl(rowEl.getAttribute("state") || "").some((d) => d.name === field);
  }
  function recordElOf(item) {
    const el = item && item.$el;
    return el && el.nodeType === 1 && el.isConnected && el.hasAttribute("item") ? el : null;
  }
  function isComposer(el) {
    return !!el.closest("form[trigger-add]");
  }
  function rowsOf(listEl) {
    const rows = [];
    for (let c = listEl.firstElementChild; c; c = c.nextElementSibling) {
      if (c.hasAttribute("item") && !c.hasAttribute("template") && !c.hasAttribute("cms-template")) rows.push(c);
    }
    return rows;
  }
  function sharedTemplate(appRoot, name) {
    if (!appRoot || !name) return null;
    const t = [...appRoot.querySelectorAll(`template[items="${name}"]`)].find((x) => x.closest("[sap]") === appRoot);
    const blueprint = t && t.content.firstElementChild;
    return blueprint && blueprint.hasAttribute("item") ? blueprint : null;
  }
  function templateOf(listEl) {
    for (let c = listEl.firstElementChild; c; c = c.nextElementSibling) {
      if (c.hasAttribute("item") && c.hasAttribute("template")) return c;
    }
    return sharedTemplate(listEl.closest("[sap]"), listEl.getAttribute("items"));
  }
  function parseStateDecl(str) {
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
      const key = attr.startsWith("data-") && attr.length > 5 ? attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : attr;
      out.push({ name: key, attr, type, default: def, transient });
    }
    return out;
  }
  function parseTyped(value, type) {
    if (type === "num") {
      if (value == null || value === "") return 0;
      const n2 = Number(value);
      return Number.isNaN(n2) ? 0 : n2;
    }
    if (type === "bool") return value === "true" || value === "" || value === "1";
    return value == null ? "" : value;
  }
  function serializeTyped(value, type) {
    if (type === "bool") return value ? "true" : "false";
    return value == null ? "" : String(value);
  }
  function isNativeBoolean(el, attr) {
    return NATIVE_BOOLEAN_SET.has(attr) && typeof el[NATIVE_PROPS[attr] || attr] === "boolean";
  }
  function isPresenceDecl(el, d) {
    return d.type === "presence" || d.type !== "num" && isNativeBoolean(el, d.attr || d.name);
  }
  function defaultRaw(d) {
    return d.default != null ? d.default : d.type === "num" ? "0" : d.type === "bool" ? "false" : "";
  }
  function readDeclared(el, d) {
    const attr = d.attr || d.name;
    if (isPresenceDecl(el, d)) return el.hasAttribute(attr);
    const raw = el.getAttribute(attr);
    return parseTyped(raw != null ? raw : defaultRaw(d), d.type);
  }
  function declaredDefault(el, d) {
    if (isPresenceDecl(el, d)) return d.default != null ? parseTyped(d.default, "bool") : false;
    return parseTyped(defaultRaw(d), d.type);
  }
  function writeDeclared(el, d, value) {
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
  function readTransient(el, decl) {
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
  function writeTransient(el, decl, value) {
    const attr = decl.attr || decl.name;
    (el._sapTransient || (el._sapTransient = {}))[decl.name] = value;
    if (el.hasAttribute(attr)) el.removeAttribute(attr);
  }
  function resolveListEl(appRoot, fromEl, path) {
    const segs = String(path).split(".");
    const listName = segs[segs.length - 1];
    if (segs.length === 1) {
      const up = findItemsUp(fromEl, listName);
      if (up) return up;
      if (appRoot.getAttribute("items") === listName) return appRoot;
      return appRoot.querySelector(`[items="${listName}"]:not(template)`);
    }
    const scopeName = segs[segs.length - 2];
    const scopeEl = [...appRoot.querySelectorAll(`[scope="${scopeName}"]`)].find(
      (s) => ownedItems(s, listName)
    );
    return scopeEl ? ownedItems(scopeEl, listName) : null;
  }
  function findItemsUp(fromEl, name) {
    let scope = nearestScopeEl(fromEl);
    while (scope) {
      if (scope.getAttribute("items") === name) return scope;
      const found = ownedItems(scope, name);
      if (found) return found;
      scope = nearestScopeEl(scope.parentElement);
    }
    return null;
  }

  // src/helpers.js
  function num(v) {
    if (typeof v === "number") return v;
    if (v == null || v === "") return 0;
    const n2 = Number(typeof v === "string" ? v.replace(/[$,%\s]/g, "") : v);
    return Number.isNaN(n2) ? 0 : n2;
  }
  function values(rows, k) {
    if (!Array.isArray(rows)) return [];
    if (k == null) return rows;
    return rows.map((r) => typeof k === "function" ? k(r) : r == null ? void 0 : r[k]);
  }
  function sum(rows, k) {
    return values(rows, k).reduce((a, v) => a + num(v), 0);
  }
  function count(rows, pred) {
    if (!Array.isArray(rows)) return 0;
    if (pred == null) return rows.length;
    return rows.reduce((a, r) => a + (pred(r) ? 1 : 0), 0);
  }
  function avg(rows, k) {
    const v = values(rows, k);
    if (!v.length) return 0;
    return sum(rows, k) / v.length;
  }
  function min(rows, k) {
    const v = values(rows, k).filter((x) => x != null && x !== "");
    if (!v.length) return 0;
    if (v.every((x) => typeof x === "number" || !Number.isNaN(Number(x)))) {
      return Math.min(...v.map(Number));
    }
    return v.reduce((a, b) => String(a) <= String(b) ? a : b);
  }
  function max(rows, k) {
    const v = values(rows, k).filter((x) => x != null && x !== "");
    if (!v.length) return 0;
    if (v.every((x) => typeof x === "number" || !Number.isNaN(Number(x)))) {
      return Math.max(...v.map(Number));
    }
    return v.reduce((a, b) => String(a) >= String(b) ? a : b);
  }
  function plural(n2, singular, pluralForm) {
    const word = num(n2) === 1 ? singular : pluralForm != null ? pluralForm : singular + "s";
    return `${n2} ${word}`;
  }
  function days(a, b) {
    const da = new Date(a);
    const db = new Date(b);
    if (Number.isNaN(+da) || Number.isNaN(+db)) return 0;
    return Math.round((db - da) / 864e5);
  }
  function n(v) {
    return typeof v === "number" ? v : Number(v);
  }
  var formats = {
    usd: (v) => "$" + n(v).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    usd2: (v) => "$" + n(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    pct: (v) => Math.round(n(v)) + "%",
    pct1: (v) => n(v).toFixed(1) + "%",
    int: (v) => Math.round(n(v)).toLocaleString("en-US"),
    num: (v) => n(v).toLocaleString("en-US"),
    num2: (v) => n(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compact: (v) => n(v).toLocaleString("en-US", { notation: "compact" }),
    date: (v) => {
      const d = new Date(v);
      return Number.isNaN(+d) ? String(v) : d.toLocaleDateString("en-US");
    },
    clock: (v) => {
      const ms = n(v);
      const total = Math.floor(ms / 100);
      const tenths = total % 10;
      const secs = Math.floor(total / 10) % 60;
      const mins = Math.floor(total / 600);
      return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
    }
  };
  var NUMERIC = /* @__PURE__ */ new Set(["usd", "usd2", "pct", "pct1", "int", "num", "num2", "compact", "clock"]);
  function applyFormat(name, v) {
    if (!name) return v == null ? "" : String(v);
    const f = formats[name];
    if (typeof f !== "function") {
      const e = new Error(`unknown format "${name}"`);
      e.sapCode = "E22";
      throw e;
    }
    if (NUMERIC.has(name)) {
      const x = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(x)) {
        const e = new Error(`format "${name}" received ${typeof v === "string" ? `"${v}"` : v}`);
        e.sapCode = "E22";
        throw e;
      }
    }
    return f(v);
  }

  // src/compile.js
  var ARGS = ["state", "item", "el", "root", "fmt", "num", "sum", "count", "avg", "min", "max", "plural", "days"];
  var cache = /* @__PURE__ */ new Map();
  var STATE_REF = /\bstate\.([a-z][a-z0-9_]*)/g;
  var ITEM_REF = /\bitem\.([a-z][a-z0-9_]*)/g;
  function extractDeps(src) {
    const state = /* @__PURE__ */ new Set();
    const item = /* @__PURE__ */ new Set();
    let m;
    STATE_REF.lastIndex = 0;
    while (m = STATE_REF.exec(src)) state.add(m[1]);
    ITEM_REF.lastIndex = 0;
    while (m = ITEM_REF.exec(src)) item.add(m[1]);
    return { state, item };
  }
  function compile(src, statement = false) {
    const key = (statement ? "!" : "") + src;
    let entry = cache.get(key);
    if (entry) return entry;
    if (cache.size > 512) cache.clear();
    try {
      const body = statement ? `"use strict";
${src}` : `"use strict"; return (${src});`;
      const fn = new Function(...ARGS, body);
      entry = { fn, src, statement, deps: extractDeps(src), error: null };
    } catch (err) {
      entry = { fn: null, src, statement, deps: { state: /* @__PURE__ */ new Set(), item: /* @__PURE__ */ new Set() }, error: err };
    }
    cache.set(key, entry);
    return entry;
  }
  function run(entry, ctx) {
    return runWith(entry, ctx.state, ctx.item, ctx.el ?? null, ctx.root);
  }
  function runWith(entry, state, item, el, root) {
    if (entry.error) throw entry.error;
    return entry.fn(state, item, el, root, formats, num, sum, count, avg, min, max, plural, days);
  }
  function topoSort(calcs) {
    const byName = /* @__PURE__ */ new Map();
    for (const c of calcs) byName.set(c.name, c);
    const out = [];
    const state = /* @__PURE__ */ new Map();
    const stack = [];
    function visit(c) {
      const s = state.get(c.name);
      if (s === 1) return;
      if (s === 0) {
        const cycle = [...stack.slice(stack.indexOf(c.name)), c.name].join(" -> ");
        const err = new Error(`calc: cycle: ${cycle}`);
        err.sapCode = "E07";
        err.cycle = cycle;
        throw err;
      }
      state.set(c.name, 0);
      stack.push(c.name);
      for (const dep of c.entry.deps.state) {
        const d = byName.get(dep);
        if (d && d !== c) visit(d);
      }
      for (const dep of c.entry.deps.item) {
        const d = byName.get(dep);
        if (d && d !== c) visit(d);
      }
      stack.pop();
      state.set(c.name, 1);
      out.push(c);
    }
    for (const c of calcs) visit(c);
    return out;
  }

  // src/plan.js
  var planGen = {};
  var watcher = null;
  var canWatch = true;
  var cacheable = false;
  function dropPlans() {
    planGen = {};
  }
  function beginPlans(root) {
    const prev = cacheable;
    if (watcher) clearFromRecords(watcher.takeRecords());
    else if (canWatch) watchPlans();
    cacheable = !!watcher && root.getRootNode() === document;
    return prev;
  }
  function endPlans(prev) {
    cacheable = prev;
  }
  function drainPlans() {
    if (watcher) clearFromRecords(watcher.takeRecords());
  }
  function watchPlans() {
    if (typeof document === "undefined" || typeof MutationObserver !== "function") {
      canWatch = false;
      return;
    }
    watcher = new MutationObserver(clearFromRecords);
    watcher.observe(document, { attributes: true, childList: true, subtree: true });
  }
  function clearFromRecords(records) {
    for (const rec of records) {
      if (rec.type === "attributes") {
        if (rec.target._sapPlan) rec.target._sapPlan = null;
      } else {
        for (const node of rec.addedNodes) if (node.nodeType === 1) clearTree(node);
      }
    }
  }
  function clearTree(el) {
    if (el._sapPlan) el._sapPlan = null;
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) clearTree(c);
  }
  function planOf(el) {
    if (!cacheable) return buildPlan(el);
    const p = el._sapPlan;
    if (p && p.gen === planGen) return p;
    return el._sapPlan = buildPlan(el);
  }
  function buildPlan(el) {
    const plan = {
      gen: planGen,
      inert: el.tagName === "TEMPLATE",
      template: false,
      item: false,
      scope: false,
      items: false,
      detail: false,
      each: false,
      boundary: null,
      bind: null,
      transient: false,
      decls: null,
      calcs: null,
      paints: null,
      effects: null,
      invalids: null
    };
    for (const attr of el.attributes) {
      const name = attr.name;
      const val = attr.value;
      const colon = name.indexOf(":");
      if (colon < 0) {
        switch (name) {
          case "sap-ignore":
            plan.inert = true;
            break;
          case "cms-template":
            plan.inert = true;
            break;
          case "template":
            plan.inert = true;
            plan.template = true;
            break;
          case "item":
            plan.item = true;
            break;
          case "scope":
            plan.scope = true;
            break;
          case "items":
            plan.items = true;
            break;
          case "detail":
            plan.detail = true;
            break;
          case "each":
            plan.each = true;
            break;
          case "bind":
            plan.bind = val;
            break;
          case "transient":
            plan.transient = true;
            break;
          case "state":
            plan.decls = parseStateDecl(val);
            break;
          case "text":
            (plan.paints || (plan.paints = [])).push({ kind: "text", fmt: null, entry: compile(val) });
            break;
          case "show":
            (plan.paints || (plan.paints = [])).push({ kind: "show", entry: compile(val) });
            break;
          case "effect":
            (plan.effects || (plan.effects = [])).push({ entry: compile(val, true) });
            break;
          case "invalid":
            (plan.invalids || (plan.invalids = [])).push({ entry: compile(val) });
            break;
        }
        continue;
      }
      const head = name.slice(0, colon);
      const tail = name.slice(colon + 1);
      switch (head) {
        case "calc":
          (plan.calcs || (plan.calcs = [])).push({ name: tail, entry: compile(val) });
          break;
        case "text":
          (plan.paints || (plan.paints = [])).push({ kind: "text", fmt: tail, entry: compile(val) });
          break;
        case "attr":
          (plan.paints || (plan.paints = [])).push({ kind: "attr", arg: tail, entry: compile(val) });
          break;
        case "class":
          (plan.paints || (plan.paints = [])).push({ kind: "class", arg: tail, entry: compile(val) });
          break;
        case "css":
          (plan.paints || (plan.paints = [])).push({ kind: "css", arg: tail, entry: compile(val) });
          break;
        case "show-when":
        case "option":
          (plan.paints || (plan.paints = [])).push({ kind: "when", match: "show", field: tail, values: val.split("|") });
          break;
        case "hide-when":
          (plan.paints || (plan.paints = [])).push({ kind: "when", match: "hide", field: tail, values: val.split("|") });
          break;
        case "option-not":
          (plan.paints || (plan.paints = [])).push({ kind: "when", match: "show-not", field: tail, values: val.split("|") });
          break;
      }
    }
    plan.boundary = plan.scope ? "scope" : plan.items ? "items" : plan.detail ? "detail" : plan.each ? "each" : null;
    return isEmpty(plan) ? emptyPlan() : plan;
  }
  var empty = null;
  function emptyPlan() {
    if (!empty || empty.gen !== planGen) {
      empty = Object.freeze({
        gen: planGen,
        inert: false,
        template: false,
        item: false,
        scope: false,
        items: false,
        detail: false,
        each: false,
        boundary: null,
        bind: null,
        transient: false,
        decls: null,
        calcs: null,
        paints: null,
        effects: null,
        invalids: null
      });
    }
    return empty;
  }
  function isEmpty(plan) {
    return !plan.inert && !plan.item && plan.boundary === null && plan.bind === null && !plan.transient && !plan.decls && !plan.calcs && !plan.paints && !plan.effects && !plan.invalids;
  }

  // src/control-serialize.js
  function inputType(el) {
    return (el.getAttribute("type") || "text").toLowerCase();
  }
  function serializeControlToAttributes(el) {
    const tag = el.tagName;
    if (tag === "INPUT") {
      const type = inputType(el);
      if (type === "checkbox" || type === "radio") {
        if (el.checked) el.setAttribute("checked", "");
        else el.removeAttribute("checked");
      } else {
        el.setAttribute("value", el.value);
      }
      return;
    }
    if (tag === "TEXTAREA") {
      el.setAttribute("data-value", el.value);
      return;
    }
    if (tag === "SELECT") {
      const opts = el.options;
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].selected) opts[i].setAttribute("selected", "");
        else opts[i].removeAttribute("selected");
      }
    }
  }
  function finalizeControlForSave(target, source = target) {
    const tag = target.tagName;
    if (tag === "INPUT") {
      const type = inputType(target);
      if (type === "checkbox" || type === "radio") {
        if (!source.checked) target.removeAttribute("checked");
        else if (!target.hasAttribute("checked")) target.setAttribute("checked", "");
      } else if (source.value !== (target.getAttribute("value") ?? "")) {
        target.setAttribute("value", source.value);
      }
      return;
    }
    if (tag === "TEXTAREA") {
      const text = source.value.startsWith("\n") ? "\n" + source.value : source.value;
      if (target.textContent !== text) target.textContent = text;
      target.removeAttribute("data-value");
      return;
    }
    if (tag === "SELECT") {
      const tOpts = target.options;
      const sOpts = source.options;
      for (let i = 0; i < tOpts.length; i++) {
        if (!(sOpts[i] && sOpts[i].selected)) tOpts[i].removeAttribute("selected");
        else if (!tOpts[i].hasAttribute("selected")) tOpts[i].setAttribute("selected", "");
      }
    }
  }
  function rehydrateControlFromAttributes(el) {
    if (el.tagName !== "TEXTAREA" || !el.hasAttribute("data-value")) return;
    if (el === el.ownerDocument.activeElement) return;
    el.textContent = el.getAttribute("data-value");
    el.removeAttribute("data-value");
  }

  // src/platform.js
  function capability(name) {
    if (typeof window === "undefined") return null;
    const clay = window.clay, hyperclay = window.hyperclay;
    if (name === "consent") return clay?.confirm || hyperclay?.consent || null;
    return clay?.[name] || hyperclay?.[name] || null;
  }
  function draftsRestored() {
    const drafts = capability("visitorDrafts");
    return Boolean(drafts && typeof drafts.restored === "function" && drafts.restored()?.restored);
  }
  var MUTATION_READY = ["clay:mutation-ready", "hyperclay:mutation-ready"];
  var LIVESYNC_APPLIED = ["clay:sync-applied", "hyperclay:livesync-applied"];
  var PLATFORM_READY = ["clay:ready", "hyperclay:ready"];
  var ROUTE_CHANGED = ["clay:route"];
  function onPlatformEvent(target, names, handler) {
    let claimedBy = null;
    const wrapped = (event) => {
      if (claimedBy !== null && claimedBy !== event.type) return;
      claimedBy = event.type;
      queueMicrotask(() => {
        claimedBy = null;
      });
      handler(event);
    };
    for (const name of names) target.addEventListener(name, wrapped);
    return () => {
      for (const name of names) target.removeEventListener(name, wrapped);
    };
  }
  function whenPlatformReady(fn) {
    const ready = typeof window !== "undefined" && window.clay && window.clay.ready;
    if (ready && typeof ready.then === "function") ready.then(() => fn(), () => fn());
    else fn();
  }
  function regionSkipsSave(el) {
    const region = capability("region");
    if (!region || typeof region.resolveRegionPolicy !== "function" || typeof region.skipForPolicy !== "function") {
      return false;
    }
    return region.skipForPolicy(region.resolveRegionPolicy(el), void 0, ["no-save", "freeze"]);
  }
  function platformConsent() {
    const fn = capability("consent");
    return typeof fn === "function" ? fn : null;
  }
  function batch(label, fn) {
    if (typeof fn !== "function") throw new Error("Sap.batch(label, fn): fn must be a function");
    const u = capability("undo");
    if (u && u.flush) u.flush();
    const r = fn();
    if (r && typeof r.then === "function") throw new Error("Sap.batch fn must be synchronous (it returned a promise)");
    if (u && u.commitCaptured) u.commitCaptured(label);
    return r;
  }
  function installBridges(runtime2) {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const refreshConnected = () => {
      let disconnected = false;
      for (const app of runtime2.apps()) {
        if (app.root.isConnected) runtime2.runNow(app, "platform");
        else disconnected = true;
      }
      if (disconnected) {
        runtime2.pruneDisconnected();
        runtime2.remountIfPresent();
      }
    };
    const derived = capability("derived");
    const offDerived = derived && typeof derived.register === "function" ? derived.register(refreshConnected) : null;
    const offApplied = typeof offDerived === "function" ? null : onPlatformEvent(document, LIVESYNC_APPLIED, refreshConnected);
    const offRoute = onPlatformEvent(document, ROUTE_CHANGED, refreshConnected);
    let undoBound = false;
    let stopWaiting = () => {
    };
    const bindUndo = () => {
      if (undoBound) return true;
      const undo = capability("undo");
      if (!undo || typeof undo.on !== "function") return false;
      const offUndo = undo.on("undo", refreshConnected);
      if (typeof offUndo !== "function") return false;
      const offRedo = undo.on("redo", refreshConnected);
      if (typeof offRedo !== "function") {
        offUndo();
        return false;
      }
      undoBound = true;
      stopWaiting();
      return true;
    };
    if (!bindUndo()) {
      const offMutationReady = onPlatformEvent(document, MUTATION_READY, bindUndo);
      const offPlatformReady = onPlatformEvent(document, PLATFORM_READY, bindUndo);
      stopWaiting = () => {
        offMutationReady();
        offPlatformReady();
      };
      const ready = capability("ready");
      if (ready && typeof ready.then === "function") ready.then(bindUndo, () => {
      });
    }
    return () => {
      if (typeof offDerived === "function") offDerived();
      if (offApplied) offApplied();
      offRoute();
      stopWaiting();
    };
  }

  // src/carrier.js
  function kindOf(el) {
    const tag = el.tagName;
    if (tag === "INPUT") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      if (t === "number" || t === "range") return "number";
      if (t === "hidden") return "hidden";
      return "text";
    }
    if (tag === "TEXTAREA") return "text";
    if (tag === "SELECT") return el.multiple ? "select-multiple" : "select-one";
    return "leaf";
  }
  function readNumber(el) {
    if (el.validity && el.validity.badInput) {
      if (el.hasAttribute("value")) return Number(el.getAttribute("value")) || 0;
      return el._sapLastGood ?? 0;
    }
    if (el.value === "") return 0;
    const n2 = Number(el.value);
    if (Number.isNaN(n2)) return el._sapLastGood ?? 0;
    el._sapLastGood = n2;
    return n2;
  }
  function readBy(el, kind) {
    switch (kind) {
      case "checkbox":
        return el.checked;
      case "radio":
        return el.checked ? el.value : void 0;
      case "number":
        return readNumber(el);
      case "select-one":
        return el.value;
      case "select-multiple":
        return [...el.selectedOptions].map((o) => o.value);
      case "hidden":
      case "text":
        return el.value;
      case "leaf":
        return el.textContent;
      default:
        return el.value;
    }
  }
  function writeBy(el, kind, v) {
    switch (kind) {
      case "checkbox":
        el.checked = !!v;
        break;
      case "radio":
        el.checked = String(el.value) === String(v);
        break;
      case "number":
      case "text":
      case "hidden":
        el.value = v == null ? "" : String(v);
        break;
      case "select-one":
        el.value = v == null ? "" : String(v);
        break;
      case "select-multiple": {
        const set = new Set((Array.isArray(v) ? v : [v]).map(String));
        for (const opt of el.options) opt.selected = set.has(opt.value);
        break;
      }
      case "leaf":
        el.textContent = v == null ? "" : String(v);
        break;
      default:
        el.value = v == null ? "" : String(v);
    }
  }
  function mirror(el) {
    if (el.hasAttribute("transient")) {
      el.removeAttribute("value");
      el.removeAttribute("checked");
      el.removeAttribute("data-value");
      return;
    }
    if (regionSkipsSave(el)) return;
    serializeControlToAttributes(el);
  }
  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function readControl(el, kind) {
    return readBy(el, kind);
  }
  function writeControl(el, kind, v) {
    writeBy(el, kind, v);
    mirror(el);
  }
  function carrierFor(el) {
    const kind = kindOf(el);
    return {
      el,
      kind,
      read() {
        return readBy(el, kind);
      },
      write(v, opts = {}) {
        writeBy(el, kind, v);
        if (!opts.noMirror) mirror(el);
        if (!opts.silent) fire(el);
      },
      mirror() {
        mirror(el);
      }
    };
  }

  // src/mutation-bridge.js
  var activeSource = null;
  var installed = false;
  var lateHubListener = null;
  function hubSource(M) {
    let unsub = null;
    return {
      kind: "hub",
      subscribe(onChanges) {
        const ret = M.onAnyChange({ debounce: 0, require: "observed" }, onChanges);
        if (typeof ret === "function") unsub = ret;
      },
      suppress(fn) {
        M.pause();
        try {
          return fn();
        } finally {
          M.resume();
        }
      },
      teardown() {
        if (unsub) {
          try {
            unsub();
          } catch {
          }
          unsub = null;
        }
      }
    };
  }
  function nativeSource() {
    let observer = null;
    return {
      kind: "native",
      subscribe(onChanges) {
        observer = new MutationObserver((records) => onChanges(changesFromRecords(records)));
        const target = typeof document !== "undefined" && document.body || typeof document !== "undefined" && document.documentElement;
        if (target) {
          observer.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
        }
      },
      suppress(fn) {
        const u = capability("undo");
        if (u && u.pause) u.pause();
        try {
          return fn();
        } finally {
          if (observer) observer.takeRecords();
          if (u && u.resume) u.resume();
        }
      },
      teardown() {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      }
    };
  }
  function changesFromRecords(records) {
    const out = [];
    for (const rec of records) {
      if (rec.type === "attributes") {
        const el = rec.target;
        if (el && el.nodeType === 1 && !inertSubtree(el)) out.push({ type: "attribute", element: el });
      } else if (rec.type === "characterData") {
        const el = rec.target && rec.target.parentElement;
        if (el && !inertSubtree(el)) out.push({ type: "characterData", element: el });
      } else if (rec.type === "childList") {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1 || inertSubtree(node)) continue;
          out.push({ type: "add", element: node });
          if (node.querySelectorAll) {
            for (const desc of node.querySelectorAll("*")) {
              if (!inertSubtree(desc)) out.push({ type: "add", element: desc });
            }
          }
        }
        for (const node of rec.removedNodes) {
          if (node.nodeType !== 1) continue;
          out.push({ type: "remove", element: node, parent: rec.target });
        }
      }
    }
    return out;
  }
  function inertSubtree(el) {
    return !!(el.closest && el.closest("[sap-ignore],[template],[cms-template]"));
  }
  function scheduleAffectedApps(runtime2, changes) {
    runtime2.pruneDisconnected();
    const affected = /* @__PURE__ */ new Set();
    let needRemount = false;
    for (const c of changes) {
      const target = c.type === "remove" ? c.parent : c.element;
      const app = target && runtime2.appFor(target);
      if (app) affected.add(app);
      if (c.type === "add" && c.element && c.element.nodeType === 1 && c.element.hasAttribute && c.element.hasAttribute("sap") && !(runtime2.isRegistered && runtime2.isRegistered(c.element))) {
        needRemount = true;
      }
    }
    if (needRemount) runtime2.remountIfPresent();
    for (const app of affected) if (app.root.isConnected) runtime2.schedule(app, "mutation");
  }
  function withDomMutationPaused(fn) {
    if (activeSource) return activeSource.suppress(fn);
    const u = capability("undo");
    if (u && u.pause && u.resume) {
      u.pause();
      try {
        return fn();
      } finally {
        u.resume();
      }
    }
    return fn();
  }
  function activate(source, runtime2) {
    installed = true;
    activeSource = source;
    source.subscribe((changes) => scheduleAffectedApps(runtime2, changes));
  }
  function installMutationBridge(runtime2) {
    if (installed) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const M = capability("Mutation");
    if (M && typeof M.onAnyChange === "function") {
      activate(hubSource(M), runtime2);
      return;
    }
    if (typeof MutationObserver === "function") {
      activate(nativeSource(), runtime2);
      lateHubListener = onPlatformEvent(document, MUTATION_READY, function onLateHub() {
        const M2 = capability("Mutation");
        if (!M2) return;
        lateHubListener();
        lateHubListener = null;
        if (activeSource) activeSource.teardown();
        installed = false;
        activate(hubSource(M2), runtime2);
      });
    }
  }
  function resetMutationBridge() {
    if (activeSource) {
      try {
        activeSource.teardown();
      } catch {
      }
    }
    if (lateHubListener && typeof document !== "undefined") {
      lateHubListener();
    }
    activeSource = null;
    installed = false;
    lateHubListener = null;
  }

  // src/pass.js
  var NATIVE_BOOLEAN_SET2 = new Set(NATIVE_BOOLEANS);
  var features = [];
  var boundaries = {};
  var paintKinds = {};
  function registerFeature(feature) {
    if (features.includes(feature)) return;
    features.push(feature);
    if (feature.boundary) Object.assign(boundaries, feature.boundary);
    if (feature.paintKinds) Object.assign(paintKinds, feature.paintKinds);
  }
  function runPass(app, opts = {}) {
    if (opts.breaker) {
      app.diag.error("E26", app.root, {
        problem: "recompute loop halted after 50 passes; recent triggers: " + (app._breakerRing || []).join(", ")
      });
      setBeacon(app.root, "loop");
      return;
    }
    if (opts.full) dropPlans();
    const plans = beginPlans(app.root);
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
    const pending = [];
    const whenFields = /* @__PURE__ */ new Set();
    app.diag.errors = [];
    const rootCtx = { root: rootObj, state: rootObj, item: null, ownerEl: root, projection: false };
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
          obj[d.name] = readTransient(el, d);
          continue;
        }
        if (isPresenceDecl(el, d)) {
          obj[d.name] = el.hasAttribute(d.attr);
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
        el.removeAttribute("value");
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
      app,
      root,
      rootObj,
      paints,
      stats: { calcs: 0, lists: 0 },
      resolveDefault,
      collectEl,
      walkScope
    };
    for (const f of features) if (f.begin) f.begin(pass);
    enterScope(root, rootObj, rootCtx);
    for (const f of features) if (f.afterIntake) f.afterIntake(pass);
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
    let writes = 0;
    let viewWrites = viewChanges;
    for (const p of paints) {
      const n2 = paintOne(p, app);
      if (p.ctx.view) viewWrites += n2;
      else writes += n2;
    }
    for (const f of features) if (f.afterPaint) f.afterPaint(pass);
    app._state = rootObj;
    app._stats = {
      fields: Object.keys(rootObj).filter((k) => typeof rootObj[k] !== "function").length,
      calcs: pass.stats.calcs,
      paints: paints.length,
      lists: pass.stats.lists,
      writes,
      viewWrites
    };
    app._viewsChanged = viewWrites > 0;
    app._lastPass = { trigger: opts.trigger || "refresh", writes };
    if (app._debug) {
      console.log(`sap pass \xB7 trigger: ${app._lastPass.trigger} \xB7 writes ${writes}/${paints.length}`);
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
  function nearestMode(el, field, values2, notMode) {
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.hasAttribute && cur.hasAttribute(field)) {
        const inList = values2.includes(cur.getAttribute(field));
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
      return applyPaint(def, el, null);
    }
    try {
      const value = runWith(def.entry, p.ctx.state, p.ctx.item, el, p.ctx.root);
      const n2 = applyPaint(def, el, value);
      clearBeacon(el);
      return n2;
    } catch (err) {
      app.diag.error(err.sapCode === "E22" ? "E22" : "E24", el, {
        attr: paintAttrName(def),
        expr: def.entry && def.entry.src,
        problem: String(err.message)
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
          if (el._sapWhen && el.hidden) {
            el.hidden = false;
            el._sapWhen = false;
            return 1;
          }
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
          let n2 = 0;
          if (el[a] !== !!value) {
            el[a] = !!value;
            n2 = 1;
          }
          if (!!value !== el.hasAttribute(a)) {
            if (value) el.setAttribute(a, "");
            else el.removeAttribute(a);
            n2 = 1;
          }
          return n2;
        }
        if (NATIVE_BOOLEAN_SET2.has(a)) {
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

  // src/lint.js
  var NATIVE_BOOLEAN_SET3 = new Set(NATIVE_BOOLEANS);
  var COLON_PREFIXES = /* @__PURE__ */ new Set(["calc", "text", "attr", "class", "css", "set", "move", "sort", "option", "option-not", "show-when", "hide-when", "editmode"]);
  var WHEN_PREFIXES = /* @__PURE__ */ new Set(["show-when", "hide-when", "option", "option-not"]);
  var EXPR_SHAPED = /\b(?:state|item|root)\.|===|!==|&&|\|\||[()]|^\s*!/;
  var KNOWN_BARE = /* @__PURE__ */ new Set([
    "sap",
    "scope",
    "items",
    "item",
    "template",
    "bind",
    "show",
    "effect",
    "invalid",
    "detail",
    "state",
    "transient",
    "confirm",
    "default",
    "persist",
    "sortable",
    "trigger-add",
    "trigger-remove",
    "trigger-reset",
    "sap-ignore",
    "sap-error",
    "no-save",
    "no-watch",
    "no-undo",
    // hyperclayjs platform region markers (canonical + legacy aliases). sapjs tolerates
    // them so a co-loaded region attribute inside a [sap] root is never flagged a typo.
    "no-trigger-autosave",
    "freeze",
    "mutations-ignore",
    "save-remove",
    "save-ignore",
    "save-freeze"
  ]);
  var extraChecks = [];
  function isControl(el) {
    return el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA";
  }
  function isBound(el) {
    return el.hasAttribute("bind");
  }
  function walkAll(root, visit) {
    visit(root);
    for (let child = root.firstElementChild; child; child = child.nextElementSibling) descend(child);
    function descend(el) {
      if (el.hasAttribute("sap-ignore")) return;
      if (el.tagName === "TEMPLATE") {
        if (el.hasAttribute("items")) for (let c = el.content.firstElementChild; c; c = c.nextElementSibling) descend(c);
        return;
      }
      visit(el);
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) descend(c);
    }
  }
  function lintApp(root, diag) {
    let halted = false;
    const halt = (code, el, info) => {
      diag.error(code, el, info);
      halted = true;
    };
    const tw = root.ownerDocument.createTreeWalker(
      root,
      4
      /* NodeFilter.SHOW_TEXT */
    );
    let node;
    while (node = tw.nextNode()) {
      if (/\{\{.*\}\}/.test(node.nodeValue || "")) {
        halt("E02", node.parentElement || root, {
          problem: "moustaches in text content are not a Sap feature",
          fix: 'move the expression onto the element: text="state.x"'
        });
        break;
      }
    }
    walkAll(root, (el) => {
      for (const check of extraChecks) check(el, halt);
      const inDetail = el.closest && el.closest("[detail]");
      for (const a of [...el.attributes]) {
        const name = a.name;
        const teach = teachForAttr(name);
        if (teach) {
          halt("E01", el, {
            attr: name,
            expr: a.value,
            problem: `"${name}" is a foreign-dialect attribute; Sap has no ${name.split(/[:=]/)[0]} directive`,
            fix: teach + " \u2014 or wrap the subtree in sap-ignore if intentional"
          });
          continue;
        }
        if (name.includes(":")) {
          const prefix = name.slice(0, name.indexOf(":"));
          if (!COLON_PREFIXES.has(prefix)) {
            const dym = didYouMean(prefix, [...COLON_PREFIXES]);
            diag.warn("W03", el, {
              attr: name,
              problem: `unknown "${prefix}:" attribute`,
              didYouMean: dym ? `${dym}:` : null
            });
          } else if (WHEN_PREFIXES.has(prefix) && EXPR_SHAPED.test(a.value)) {
            const field = name.slice(name.indexOf(":") + 1);
            diag.warn("W04", el, {
              attr: name,
              expr: a.value,
              problem: `${prefix}: compares the "${field}" attribute against a literal value, not a JS expression`,
              fix: `use show="${a.value}" for an expression, or a literal like ${prefix}:${field}="overview"`
            });
          }
        } else if (!KNOWN_BARE.has(name) && !HTML_GLOBALS.has(name) && !NATIVE_BOOLEAN_SET3.has(name) && !/^(data-|aria-|on)/.test(name) && !(name in el)) {
          const dym = didYouMean(name, [...KNOWN_BARE]);
          if (dym) {
            diag.warn("W03", el, { attr: name, problem: `unknown "${name}" attribute`, didYouMean: dym });
          }
        }
        if (name === "attr:hidden") {
          diag.warn("W03", el, { attr: name, problem: "attr:hidden paints the wrong attribute", fix: 'use show="expr"' });
        }
        const ownedByBind = isBound(el) || name === "attr:selected" && el.tagName === "OPTION" && !!el.closest("select[bind]");
        if ((name === "attr:value" || name === "attr:checked" || name === "attr:selected") && ownedByBind) {
          halt("E30", el, { attr: name, problem: "attr: on a bound control collides with persist ownership", fix: "remove it; bind owns this attribute" });
        }
        if (name === "effect" && isBound(el) && /\b(value|checked)\s*=[^=]/.test(a.value)) {
          halt("E30", el, { attr: name, expr: a.value, problem: "effect writes value/checked on a bound control (writes a stale value with no synthetic event)", fix: "write through onclick + Sap(this) instead" });
        }
        if ((name === "text" || name.startsWith("text:") || name === "show") && isControl(el)) {
          if (name === "show") {
          } else {
            halt("E18", el, { attr: name, problem: "paint belongs on output elements, not form controls", fix: "move the paint to an <output> or <span>" });
          }
        }
      }
      if (el.hasAttribute("state")) {
        const decls = parseStateDecl(el.getAttribute("state"));
        const seen = /* @__PURE__ */ new Set();
        for (const d of decls) {
          if (d.name.includes("-")) {
            halt("E08", el, { attr: "state", problem: `field "${d.name}" is not a valid identifier (the hyphen parses as subtraction)`, fix: `rename to ${d.name.replace(/-/g, "")}` });
          }
          if (seen.has(d.name)) halt("E04", el, { attr: "state", problem: `field "${d.name}" is declared twice in one scope` });
          seen.add(d.name);
          if (RESERVED.has(d.attr)) halt("E05", el, { attr: "state", problem: `"${d.name}" is a reserved Sap word` });
          if (HTML_GLOBALS.has(d.attr)) halt("E06", el, { attr: "state", problem: `"${d.name}" is a global HTML attribute name; pick another field name` });
          if (d.name === "open" && el.tagName === "DIALOG") {
            halt("E33", el, { attr: "state", problem: "dialog open is transient", fix: "use showModal() \u2014 declare state= only on <details> or popovers" });
          }
          const native = isNativeBoolean(el, d.attr);
          if (native && (d.attr === "checked" || d.attr === "selected")) {
            halt("E35", el, { attr: "state", problem: `"${d.attr}" on a form control is the control's own state, not a declared field`, fix: 'bind the control instead, e.g. <input type="checkbox" bind="done">' });
          }
          if (native && d.type === "num") {
            halt("E35", el, { attr: "state", problem: `"${d.attr}" is an HTML boolean attribute; it cannot hold a number`, fix: `declare it bare: state="${d.attr}"` });
          }
          if (d.transient && (native || d.type === "presence")) {
            halt("E35", el, { attr: "state", problem: `"${d.name}" is carried by attribute presence, which transient would strip`, fix: "declare a separate name:bool:transient field and paint the attribute from it" });
          }
        }
      }
      if (isBound(el)) {
        if (el.hasAttribute("-")) {
        }
        if (el.tagName === "INPUT") {
          const t = (el.getAttribute("type") || "text").toLowerCase();
          if (t === "file") halt("E32", el, { attr: "bind", problem: "files never serialize into an HTML file", fix: "use no-save + effect instead of bind" });
          if (t === "password" && !el.hasAttribute("transient")) {
            halt("E31", el, { attr: "bind", problem: "a password must never serialize into a world-readable file", fix: "add transient to the password input" });
          }
        } else if (el.tagName !== "SELECT" && el.tagName !== "TEXTAREA") {
          const ce = el.getAttribute("contenteditable");
          const editable = ce != null && ce !== "false";
          if (!editable && el.children.length > 0) {
            halt("E20", el, { attr: "bind", problem: "bind on a container element is not a control; a write would overwrite its children", fix: "bind a control (input/select/textarea), a contenteditable, or an empty text leaf" });
          }
        }
      }
      if (el.hasAttribute("transient") && el.hasAttribute("persist")) {
        halt("E34", el, {
          problem: "transient and persist are opposite: persist forces the live value into the saved bytes, leaking exactly what transient drops",
          fix: "remove one \u2014 transient to keep it out of the file, or persist to save it"
        });
      }
      if (el.tagName === "DIALOG" && el.hasAttribute("detail") && !(el.parentElement && el.parentElement.closest('[clay~="freeze"], [freeze], [save-freeze]'))) {
        diag.warn("W31", el, {
          attr: "detail",
          problem: "a detail dialog writes open when it opens, and that attribute would be saved into the file",
          fix: 'wrap the dialog in an element with clay="freeze" (not editor-ui, which removes it from the file), and make its key field transient'
        });
      }
      if (el.hasAttribute("item") && !el.hasAttribute("template") && el.parentNode && el.parentNode.nodeType === 1) {
        const list = el.parentElement;
        if (!list || !list.hasAttribute("items")) {
          halt("E10", el, { problem: "an [item] must be a direct child of an [items] list", fix: 'wrap it in a container with items="name"' });
        }
      }
      if (el.hasAttribute("items") && inDetail) {
        halt("E17", el, { attr: "items", problem: "nested items inside a detail panel is a v1 mount error (nested collections ship in v1.1)" });
      }
      if (el.hasAttribute("items")) {
        const targeted = root.querySelector(`[trigger-add="${el.getAttribute("items")}"]`);
        if (!templateOf(el) && !sharedTemplate(root, el.getAttribute("items")) && rowsOf(el).length === 0 && targeted) {
          halt("E17", el, { attr: "items", problem: `trigger-add targets items="${el.getAttribute("items")}" but it has no [item template] to clone` });
        }
      }
    });
    if (halted) {
      diag.halted = true;
      diag.haltReason = diag.errors[0] ? diag.errors[0].code : "halt";
      setBeacon(root, diag.haltReason);
    }
    return !halted;
  }

  // src/mount.js
  var STYLE_ID = "sap-styles";
  var STYLE_TEXT = "[item][template]{display:none!important}[hidden]{display:none!important}[sap-error]{outline:2px solid #e5484d;outline-offset:1px}";
  var styledDocs = /* @__PURE__ */ new WeakSet();
  function injectStyles(doc) {
    if (styledDocs.has(doc)) return;
    const view = doc.defaultView;
    const SheetCtor = view && view.CSSStyleSheet;
    if (SheetCtor && "adoptedStyleSheets" in doc) {
      try {
        const sheet = new SheetCtor();
        sheet.replaceSync(STYLE_TEXT);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
        styledDocs.add(doc);
        return;
      } catch {
      }
    }
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = STYLE_TEXT;
      (doc.head || doc.documentElement).appendChild(style);
    }
    styledDocs.add(doc);
  }
  var appSeq = 0;
  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : 0;
  }
  function mountApp(root) {
    const name = root.id || root.getAttribute("sap") || `app-${appSeq++}`;
    const diag = new Diagnostics(name);
    const appRec = {
      root,
      name,
      diag,
      _state: null,
      _stats: null,
      _lastPass: null,
      _passes: 0,
      _broken: false,
      _mountMs: 0,
      _mountWrites: 0
    };
    const ok = lintApp(root, diag);
    if (!ok) {
      appRec.halted = true;
      return appRec;
    }
    injectStyles(root.ownerDocument);
    for (const ta of root.querySelectorAll("textarea[data-value]")) rehydrateControlFromAttributes(ta);
    const t0 = now();
    runPass(appRec, { trigger: "mount", full: true });
    appRec._mountMs = now() - t0;
    appRec._mountWrites = appRec._stats ? appRec._stats.writes : 0;
    if (appRec._mountWrites > 0 && !draftsRestored() && !capability("derived")) {
      diag.warn("W30", root, {
        problem: `${appRec._mountWrites} paint(s) ran at mount; the saved file was out of sync with its declared state`,
        fix: "re-save once so the file mounts clean (a settled file writes nothing)"
      });
    }
    return appRec;
  }

  // src/debug.js
  var ACTION_RE = /^(set:|move:|sort:|trigger-add$|trigger-remove$|trigger-reset$)/;
  function rootLabel(root) {
    return `${root.tagName.toLowerCase()}[sap]`;
  }
  function countActions(root) {
    let n2 = 0;
    for (const el of root.querySelectorAll("*")) {
      for (const a of el.attributes) if (ACTION_RE.test(a.name)) {
        n2++;
        break;
      }
    }
    for (const a of root.attributes) if (ACTION_RE.test(a.name)) {
      n2++;
      break;
    }
    return n2;
  }
  function exprSources(root) {
    const out = [];
    const scan = (el) => {
      for (const a of el.attributes) {
        const n2 = a.name;
        if (n2.startsWith("calc:") || n2 === "text" || n2.startsWith("text:") || n2 === "show" || n2.startsWith("attr:") || n2.startsWith("class:") || n2.startsWith("css:") || n2 === "effect" || n2 === "invalid" || n2.startsWith("set:") || n2 === "detail") out.push({ el, attr: n2, src: a.value });
      }
    };
    scan(root);
    for (const el of root.querySelectorAll("*")) scan(el);
    return out;
  }
  function createDebug(runtime2) {
    function appView(app) {
      const s = app._stats || {};
      const root = app.root;
      return {
        root: rootLabel(root),
        fields: s.fields || 0,
        calcs: s.calcs || 0,
        paints: s.paints || 0,
        actions: countActions(root),
        lists: (root.hasAttribute("items") ? 1 : 0) + root.querySelectorAll("[items]").length,
        rows: root.querySelectorAll("[item]:not([template])").length,
        warnings: app.diag.warnings.length,
        errors: app.diag.errors.length,
        mountWrites: app._mountWrites || 0,
        ms: Math.round((app._mountMs || 0) * 10) / 10,
        passes: app._passes || 0,
        lastPass: app._lastPass || null,
        ok: app.diag.errors.length === 0 && !app.halted
      };
    }
    function status() {
      const apps = runtime2.apps().map(appView);
      return { ok: apps.every((a) => a.ok), apps };
    }
    function greenLine(app) {
      const v = appView(app);
      if (!v.ok) {
        return `sap \u2717 ${v.root} \xB7 errors ${v.errors} \xB7 warnings ${v.warnings} \xB7 ${v.ms}ms`;
      }
      return `sap \u2713 ${v.root} \xB7 fields ${v.fields} \xB7 calcs ${v.calcs} \xB7 paints ${v.paints} \xB7 actions ${v.actions} \xB7 lists ${v.lists} \xB7 rows ${v.rows} \xB7 warnings ${v.warnings} \xB7 mount writes ${v.mountWrites} \xB7 ${v.ms}ms`;
    }
    function printGreenLines() {
      for (const app of runtime2.apps()) {
        const line = greenLine(app);
        if (app.diag.errors.length || app.halted) console.error(line);
        else console.log(line);
      }
    }
    function report() {
      const errors = [];
      const warnings = [];
      for (const app of runtime2.apps()) {
        errors.push(...app.diag.errors);
        warnings.push(...app.diag.warnings);
      }
      return { ok: errors.length === 0, errors, warnings, counts: { errors: errors.length, warnings: warnings.length } };
    }
    function resolveEl(elOrSel) {
      if (!elOrSel) return null;
      if (typeof elOrSel === "string") return document.querySelector(elOrSel);
      return elOrSel.nodeType === 1 ? elOrSel : null;
    }
    function why(elOrSel, field) {
      const el = resolveEl(elOrSel);
      if (!el) {
        console.warn("sap why: element not found");
        return null;
      }
      const lines = [`sap why <${el.tagName.toLowerCase()}> \u2014 ${cssPath(el)}`];
      const sapAttrs = [...el.attributes].filter((a) => /^(bind|text|show|effect|invalid|detail|calc:|text:|attr:|class:|css:|set:|state|items|scope)/.test(a.name));
      for (const a of sapAttrs) lines.push(`  ${a.name}="${a.value}"`);
      let scopeEl = el;
      while (scopeEl && !scopeEl._sapScope) scopeEl = scopeEl.parentElement;
      if (scopeEl && scopeEl._sapScope) {
        const snap = scopeEl._sapScope;
        const keys = field ? [field] : Object.keys(snap);
        lines.push("  reads:");
        for (const k of keys) {
          const v = snap[k];
          if (typeof v === "function") continue;
          lines.push(`    ${k} = ${JSON.stringify(Array.isArray(v) ? `[${v.length} rows]` : v)}`);
        }
      }
      lines.push("  serialization: textContent and value/checked attributes save with the file; reads live from properties");
      console.log(lines.join("\n"));
      return null;
    }
    function debug(flag) {
      const on = flag === void 0 ? true : !!flag;
      for (const app of runtime2.apps()) app._debug = on;
      console.log(`sap debug ${on ? "on" : "off"} \u2014 per-pass headers will ${on ? "" : "no longer "}log`);
      return on;
    }
    function doctor() {
      const findings = [];
      let checks = 0;
      for (const app of runtime2.apps()) {
        const root = app.root;
        const label = rootLabel(root);
        checks++;
        const d2 = new Diagnostics(app.name);
        lintApp(root, d2);
        for (const e2 of d2.errors) findings.push({ code: e2.code, severity: "error", message: `${label}: ${e2.code} ${e2.slug} at ${e2.el}` });
        for (const w2 of d2.warnings) findings.push({ code: w2.code, severity: "warn", message: `${label}: ${w2.code} ${w2.slug} at ${w2.el}` });
        checks++;
        runPass(app, { trigger: "doctor-dryrun" });
        const w = app._stats ? app._stats.writes : 0;
        if (w > 0) findings.push({ code: "W30", severity: "warn", message: `${label}: dry recompute wrote ${w} cells on a quiet page; an element is stale or non-idempotent` });
        checks++;
        const srcs = exprSources(root).map((s) => s.src).join(" \0 ");
        const decls = [];
        for (const el of [root, ...root.querySelectorAll("[state]")]) {
          for (const d of parseStateDecl(el.getAttribute("state") || "")) decls.push(d.name);
        }
        for (const name of decls) {
          const re = new RegExp(`(state|item)\\.${name}\\b`);
          if (!re.test(srcs)) findings.push({ code: "I33", severity: "info", message: `${label}: field "${name}" is declared but read nowhere (dead state)` });
        }
        checks++;
        const ids = /* @__PURE__ */ new Map();
        for (const el of root.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) || 0) + 1);
        for (const [id, n2] of ids) if (n2 > 1) findings.push({ code: "W32", severity: "warn", message: `${label}: duplicate id "${id}" (${n2} elements) \u2014 clone/edit collision` });
        checks++;
        for (const s of exprSources(root)) {
          if (s.src.length > 120) findings.push({ code: "I33", severity: "info", message: `${label}: ${s.attr} expression is ${s.src.length} chars; consider a calc: field` });
        }
        checks++;
        for (const el of root.querySelectorAll("[text], [text\\:num]")) {
          const t = el.textContent || "";
          if (/\.\d{5,}/.test(t)) findings.push({ code: "I33", severity: "info", message: `${label}: ${cssPath(el)} paints >4 decimals; consider text:FMT` });
        }
      }
      const e = findings.filter((f) => f.severity === "error").length;
      const wn = findings.filter((f) => f.severity === "warn").length;
      const i = findings.filter((f) => f.severity === "info").length;
      const ms = 0;
      console.log(`sap doctor \xB7 ${runtime2.apps().map((a) => rootLabel(a.root)).join(", ")} \xB7 errors ${e} \xB7 warnings ${wn} \xB7 info ${i} \xB7 ${checks} checks \xB7 ${ms}ms`);
      for (const f of findings) {
        const fn = f.severity === "error" ? console.error : f.severity === "warn" ? console.warn : console.info;
        fn(`  ${f.severity === "error" ? "\u2717" : f.severity === "warn" ? "\u26A0" : "\xB7"} ${f.message}`);
      }
      return findings;
    }
    return { status, report, why, debug, doctor, greenLine, printGreenLines, REGISTRY };
  }

  // src/version.js
  var VERSION = "0.5.2";

  // src/runtime.js
  function createSap({ createAccessor: createAccessor2, installInput }) {
    const registry = /* @__PURE__ */ new Map();
    const order = [];
    const scheduler = createScheduler(runPass);
    function appFor(el) {
      let cur = el;
      while (cur) {
        if (cur.nodeType === 1 && cur.hasAttribute && cur.hasAttribute("sap")) {
          return registry.get(cur) || null;
        }
        cur = cur.parentNode && cur.parentNode.host ? cur.parentNode.host : cur.parentElement;
      }
      return null;
    }
    function pruneDisconnected() {
      for (let i = order.length - 1; i >= 0; i--) {
        const app = order[i];
        if (!app.root.isConnected) {
          registry.delete(app.root);
          order.splice(i, 1);
        }
      }
    }
    function moveInto(parent, el) {
      if (parent.moveBefore) {
        try {
          parent.moveBefore(el, null);
          return;
        } catch {
        }
      }
      parent.appendChild(el);
    }
    function placeBefore(el, ref) {
      const parent = ref.parentElement;
      if (!parent) return;
      if (parent.moveBefore) {
        try {
          parent.moveBefore(el, ref);
          return;
        } catch {
        }
      }
      parent.insertBefore(el, ref);
    }
    const runtime2 = {
      apps: () => order.slice(),
      appFor,
      isRegistered: (el) => registry.has(el),
      pruneDisconnected,
      schedule: (app, trigger) => scheduler.schedule(app, trigger),
      runNow: (app, trigger) => scheduler.runNow(app, trigger),
      moveInto,
      placeBefore,
      remountIfPresent: () => mountAll2()
    };
    const accessor = createAccessor2(runtime2);
    const debugApi = createDebug(runtime2);
    let installed2 = false;
    let disabled = false;
    let teardownBridges = null;
    function installOnce() {
      if (installed2) return;
      installed2 = true;
      installInput(runtime2, accessor, document);
      teardownBridges = installBridges(runtime2);
    }
    function announceMounted() {
      const derived = capability("derived");
      if (derived && typeof derived.mounted === "function") derived.mounted();
    }
    function mountAll2(docRoot = document) {
      if (disabled) return [];
      installOnce();
      installMutationBridge(runtime2);
      const roots = docRoot.querySelectorAll("[sap]");
      const fresh = [];
      for (const root of roots) {
        if (registry.has(root)) continue;
        const appRec = mountApp(root);
        registry.set(root, appRec);
        order.push(appRec);
        fresh.push(appRec);
      }
      for (const app of fresh) {
        const line = debugApi.greenLine(app);
        if (app.diag.errors.length || app.halted) console.error(line);
        else console.log(line);
      }
      announceMounted();
      return fresh;
    }
    function mount2(rootOrSel) {
      if (disabled) return null;
      installOnce();
      installMutationBridge(runtime2);
      if (!rootOrSel) return mountAll2();
      const root = typeof rootOrSel === "string" ? document.querySelector(rootOrSel) : rootOrSel;
      if (!root) return null;
      if (registry.has(root)) return registry.get(root);
      const appRec = mountApp(root);
      registry.set(root, appRec);
      order.push(appRec);
      const line = debugApi.greenLine(appRec);
      if (appRec.diag.errors.length || appRec.halted) console.error(line);
      else console.log(line);
      return appRec;
    }
    const Sap2 = accessor.Sap;
    Sap2.version = VERSION;
    Sap2.refresh = function refresh() {
      for (const app of order) if (app.root.isConnected) scheduler.runNow(app, "refresh");
    };
    Sap2.batch = batch;
    Sap2.status = debugApi.status;
    Sap2.report = debugApi.report;
    Sap2.why = debugApi.why;
    Sap2.debug = debugApi.debug;
    Sap2.doctor = debugApi.doctor;
    Sap2.greenLine = debugApi.greenLine;
    Sap2.formats = formats;
    Sap2.serializeControlToAttributes = serializeControlToAttributes;
    Sap2.finalizeControlForSave = finalizeControlForSave;
    Sap2.rehydrateControlFromAttributes = rehydrateControlFromAttributes;
    Sap2.mount = mount2;
    Sap2.config = function config(options = {}) {
      if (options.formats) Object.assign(formats, options.formats);
      return Sap2;
    };
    Sap2._registry = registry;
    Sap2._reset = function reset() {
      registry.clear();
      order.length = 0;
      resetMutationBridge();
    };
    Sap2.unmount = function unmount() {
      disabled = true;
      registry.clear();
      order.length = 0;
      resetMutationBridge();
      if (typeof teardownBridges === "function") teardownBridges();
    };
    return { Sap: Sap2, mountAll: mountAll2, mount: mount2, runtime: runtime2 };
  }
  function autoMount(mountAll2) {
    if (typeof document === "undefined") return;
    const go = () => whenPlatformReady(() => mountAll2());
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", go);
    } else {
      go();
    }
  }

  // src/scope.js
  var ID_REF_ATTRS = [
    "for",
    "form",
    "list",
    "headers",
    "popovertarget",
    "commandfor",
    "anchor",
    "aria-activedescendant",
    "aria-controls",
    "aria-describedby",
    "aria-details",
    "aria-errormessage",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns"
  ];
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
      if (cur.hasAttribute("sap")) break;
      cur = nearestScopeEl(cur.parentElement);
    }
    return null;
  }
  function inferType(v) {
    if (typeof v === "number") return "num";
    if (typeof v === "boolean") return "bool";
    return "string";
  }
  function createAccessor(runtime2) {
    function contextElFor(el) {
      const appRec = runtime2.appFor(el);
      if (!appRec) return null;
      const viewRow = nearestViewRow(el);
      const source = viewRow && viewRow._sapEachItem && viewRow._sapEachItem.$el;
      if (source && source.isConnected) return { ctxEl: source, appRec, isRow: true };
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
    function Sap2(elOrSel) {
      const el = typeof elOrSel === "string" ? document.querySelector(elOrSel) : elOrSel;
      if (!el || el.nodeType !== 1) return null;
      const res = contextElFor(el);
      if (!res) return null;
      return makeProxy(res.ctxEl, res.appRec, res.isRow);
    }
    function writeTargetFor(el, field) {
      const viewRow = nearestViewRow(el);
      if (!viewRow) return Sap2(el);
      const appRec = runtime2.appFor(el);
      const source = viewRow._sapEachItem && viewRow._sapEachItem.$el;
      if (source && source.nodeType === 1 && source.hasAttribute("item") && ownsField(source, field)) {
        return source.isConnected ? makeProxy(source, appRec, true) : null;
      }
      const drawn = viewRow.parentElement && viewRow.parentElement._sapDrawnEl;
      if (!drawn || !drawn.isConnected) return null;
      return makeProxy(drawn, appRec, drawn.hasAttribute("item"));
    }
    function readField(ctxEl, appRec, field) {
      const control = ownedBind(ctxEl, field);
      if (control) return carrierFor(control).read();
      const listEl = ownedItems(ctxEl, field);
      if (listEl) return rowsOf(listEl).map((r) => makeProxy(r, appRec, true));
      const sub = ownedScope(ctxEl, field);
      if (sub) return makeProxy(sub, appRec, false);
      const decl = declarerOf(ctxEl, appRec.root, field);
      if (decl) {
        if (decl.decl.transient) return readTransient(decl.el, decl.decl);
        return readDeclared(decl.el, decl.decl);
      }
      const snap = ctxEl._sapScope;
      return snap ? snap[field] : void 0;
    }
    function setStateAttr(el, field, value, decl, appRec) {
      if (decl.transient) writeTransient(el, decl, value);
      else writeDeclared(el, decl, value);
      runtime2.schedule(appRec, "set:" + field);
    }
    function knownFieldsFor(ctxEl, appRoot) {
      const names = /* @__PURE__ */ new Set();
      let cur = nearestScopeEl(ctxEl) || appRoot;
      while (cur) {
        for (const d of parseStateDecl(cur.getAttribute("state") || "")) names.add(d.name);
        if (cur.hasAttribute("sap")) break;
        cur = nearestScopeEl(cur.parentElement);
      }
      walkOwned(ctxEl, (el) => {
        const b = el.getAttribute("bind");
        if (b) names.add(b);
      });
      return names;
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
        if (probe.hasAttribute("sap")) break;
        probe = probe.parentElement;
      }
      const decl = declarerOf(ctxEl, appRec.root, field);
      if (decl) {
        setStateAttr(decl.el, field, value, decl.decl, appRec);
        return;
      }
      const known = knownFieldsFor(ctxEl, appRec.root);
      known.delete(field);
      const guess = field.length >= 4 ? didYouMean(field, [...known]) : null;
      if (guess) {
        appRec.diag.error("E12", ctxEl, { key: field, problem: `unknown state key "${field}"`, didYouMean: guess });
        return;
      }
      if (RESERVED.has(field) || HTML_GLOBALS.has(field)) {
        appRec.diag.error("E15", ctxEl, {
          key: field,
          problem: `cannot write undeclared field "${field}" \u2014 it is a reserved/global name and cannot become state`,
          fix: "pick a different field name, or declare it explicitly in a state= attribute"
        });
        return;
      }
      const root = appRec.root;
      const type = inferType(value);
      const decls = root.getAttribute("state") || "";
      const token = type === "string" ? field : `${field}:${type}`;
      root.setAttribute("state", decls ? `${decls} ${token}` : token);
      setStateAttr(root, field, value, { name: field, attr: field, type, transient: false }, appRec);
    }
    function freshIds(rootClone) {
      const doc = rootClone.ownerDocument;
      const renamed = /* @__PURE__ */ new Map();
      const remint = (el, attr) => {
        const id = mintId(doc);
        const old = el.getAttribute(attr);
        if (old && attr === "id") renamed.set(old, id);
        el.setAttribute(attr, id);
      };
      rootClone.querySelectorAll("[id]").forEach((el) => remint(el, "id"));
      rootClone.querySelectorAll("[data-id]").forEach((el) => remint(el, "data-id"));
      rootClone.querySelectorAll("[sap-error]").forEach((el) => el.removeAttribute("sap-error"));
      rootClone.removeAttribute("sap-error");
      if (rootClone.hasAttribute("data-id")) {
        rootClone.removeAttribute("id");
        remint(rootClone, "data-id");
      } else {
        remint(rootClone, "id");
      }
      for (const el of [rootClone, ...rootClone.querySelectorAll("*")]) {
        for (const attr of ID_REF_ATTRS) {
          const v = el.getAttribute(attr);
          if (v == null) continue;
          const next = v.split(/\s+/).map((t) => renamed.get(t) || t).join(" ");
          if (next !== v) el.setAttribute(attr, next);
        }
      }
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
      const clone = listEl.ownerDocument.importNode(tmpl, true);
      clone.removeAttribute("template");
      freshIds(clone);
      listEl.appendChild(clone);
      runtime2.schedule(appRec, "trigger-add:" + name);
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
        const value = declaredDefault(ctxEl, d);
        if (d.transient) writeTransient(ctxEl, d, value);
        else writeDeclared(ctxEl, d, value);
      }
      runtime2.schedule(appRec, "trigger-reset");
    }
    function doRemove(ctxEl, appRec) {
      if (!ctxEl.isConnected) throw new Error("stale row handle: $remove() on a removed row");
      ctxEl.remove();
      runtime2.schedule(appRec, "trigger-remove");
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
      runtime2.moveInto(listEl, ctxEl);
      runtime2.schedule(appRec, "trigger-move");
    }
    function rowIndex(ctxEl) {
      const list = ctxEl.parentElement;
      if (!list) return -1;
      return rowsOf(list).indexOf(ctxEl);
    }
    function makeProxy(ctxEl, appRec, isRow) {
      const verbs = {
        get $el() {
          return ctxEl;
        },
        get $key() {
          return keyOf(ctxEl, isRow ? "row" : "scope");
        },
        get $index() {
          return rowIndex(ctxEl);
        },
        $add(name) {
          return doAdd(ctxEl, appRec, name);
        },
        $reset() {
          doReset(ctxEl, appRec);
          return proxy;
        },
        $remove() {
          doRemove(ctxEl, appRec);
        },
        $move(target) {
          doMove(ctxEl, appRec, target);
        },
        get $appRec() {
          return appRec;
        }
      };
      const proxy = new Proxy(verbs, {
        get(t, prop) {
          if (typeof prop === "symbol") return t[prop];
          if (prop[0] === "$") return t[prop];
          return readField(ctxEl, appRec, prop);
        },
        set(t, prop, value) {
          if (typeof prop === "string" && prop[0] === "$") {
            t[prop] = value;
            return true;
          }
          writeField(ctxEl, appRec, prop, value);
          return true;
        },
        has(t, prop) {
          if (typeof prop === "string" && prop[0] === "$") return prop in t;
          return readField(ctxEl, appRec, prop) !== void 0;
        }
      });
      return proxy;
    }
    return { Sap: Sap2, contextElFor, readField, writeField, makeProxy, writeTargetFor };
  }

  // src/actions.js
  var TRIGGER_WORDS = ["trigger-add", "trigger-remove", "trigger-reset"];
  function hasAction(el) {
    if (el.nodeType !== 1) return false;
    for (const a of el.attributes) {
      const n2 = a.name;
      if (n2.startsWith("set:") || n2.startsWith("move:") || n2.startsWith("sort:")) return true;
      if (TRIGGER_WORDS.includes(n2)) return true;
    }
    return false;
  }
  function findActionEl(target, root) {
    let el = target;
    const stop = root.parentElement;
    while (el && el !== stop) {
      if (el.nodeType === 1) {
        if (hasAction(el) && !(el.tagName === "FORM" && el.hasAttribute("trigger-add"))) return el;
      }
      el = el.parentElement;
    }
    return null;
  }
  function createActions(runtime2, accessor) {
    const { Sap: Sap2 } = accessor;
    function actionCtx(el, appRec) {
      let item = null;
      const viewRow = nearestViewRow(el);
      const detailEl = isInsideDetail(el);
      if (viewRow) item = viewRow._sapEachItem ?? null;
      else if (detailEl && detailEl._sapDetailRow) item = detailEl._sapDetailRow._sapScope || null;
      else {
        const itemEl = nearestItemEl(el);
        if (itemEl && itemEl.hasAttribute("item")) item = itemEl._sapScope || null;
      }
      const scopeEl = nearestScopeEl(el) || appRec.root;
      const state = scopeEl._sapScope || appRec._state || {};
      return { state, item, el, root: appRec._state || {} };
    }
    function gateThenRun(el, appRec, proceed) {
      if (!el.hasAttribute("confirm")) {
        proceed();
        return;
      }
      const raw = el.getAttribute("confirm");
      let msg = raw;
      const entry = compile(raw);
      if (!entry.error) {
        try {
          const v = run(entry, actionCtx(el, appRec));
          if (typeof v === "string" || typeof v === "number") msg = String(v);
        } catch {
        }
      }
      const consent = platformConsent();
      if (!consent) {
        if (window.confirm(msg)) proceed();
        return;
      }
      if (el._sapGatePending) return;
      el._sapGatePending = true;
      const done = () => {
        el._sapGatePending = false;
      };
      consent(msg, () => {
        done();
        proceed();
      }).catch(done);
    }
    function runSet(el, appRec) {
      for (const a of el.attributes) {
        if (!a.name.startsWith("set:")) continue;
        const field = a.name.slice(4);
        const entry = compile(a.value);
        if (entry.error) {
          appRec.diag.error("E08", el, { attr: a.name, expr: a.value, problem: String(entry.error.message) });
          continue;
        }
        let value;
        try {
          value = run(entry, actionCtx(el, appRec));
        } catch (err) {
          appRec.diag.error("E24", el, { attr: a.name, expr: a.value, problem: String(err.message) });
          continue;
        }
        const proxy = accessor.writeTargetFor(el, field);
        if (proxy) proxy[field] = value;
      }
    }
    function sourceRowOf(el) {
      const viewRow = nearestViewRow(el);
      if (!viewRow) return el.closest("[item]");
      const src = viewRow._sapEachItem && viewRow._sapEachItem.$el;
      return src && src.nodeType === 1 && src.hasAttribute("item") ? src : null;
    }
    function moveStep(el, dir) {
      const row = sourceRowOf(el);
      if (!row) return;
      const siblings = rowsOf(row.parentElement);
      const i = siblings.indexOf(row);
      if (dir === "up" && i > 0) runtime2.placeBefore(row, siblings[i - 1]);
      else if (dir === "down" && i < siblings.length - 1) runtime2.placeBefore(siblings[i + 1], row);
    }
    function resolveSortList(el, value, appRec) {
      if (value) return resolveListEl(appRec.root, el, value);
      let cur = el;
      while (cur) {
        if (cur.hasAttribute && cur.hasAttribute("items")) return cur;
        cur = cur.parentElement;
      }
      const scopeEl = nearestScopeEl(el) || appRec.root;
      const lists = [];
      walkOwned(scopeEl, (e) => {
        if (e.hasAttribute("items")) lists.push(e);
      });
      return lists[0] || null;
    }
    function cmp(a, b) {
      const ea = a == null || a === "";
      const eb = b == null || b === "";
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    }
    function runSort(el, field, value, appRec) {
      const listEl = resolveSortList(el, value, appRec);
      if (!listEl) {
        appRec.diag.error("E17", el, { attr: "sort:" + field, problem: `no items list resolvable for sort:${field}` });
        return;
      }
      const rows = rowsOf(listEl);
      const valOf = (r) => r._sapScope ? r._sapScope[field] : void 0;
      const asc = [...rows].sort((a, b) => cmp(valOf(a), valOf(b)));
      const isAsc = asc.every((r, i) => r === rows[i]);
      const ordered = isAsc ? [...asc].reverse() : asc;
      for (const r of ordered) runtime2.moveInto(listEl, r);
      runtime2.schedule(appRec, "sort:" + field);
    }
    function focusFirstEditable(rowEl) {
      if (!rowEl || rowEl.hidden) return;
      const f = rowEl.querySelector("[bind]:not([type=hidden]), [contenteditable]");
      if (f && typeof f.focus === "function") f.focus();
    }
    function runAction(actionEl, appRec) {
      gateThenRun(actionEl, appRec, () => {
        const proxy = Sap2(actionEl);
        for (const a of [...actionEl.attributes]) {
          const n2 = a.name;
          if (n2 === "trigger-remove") proxy && proxy.$remove();
          else if (n2 === "trigger-reset") proxy && proxy.$reset();
          else if (n2 === "trigger-add") {
            const row = proxy && proxy.$add(a.value);
            if (row) focusFirstEditable(row.$el);
          } else if (n2 === "move:up") {
            moveStep(actionEl, "up");
            runtime2.schedule(appRec, "move:up");
          } else if (n2 === "move:down") {
            moveStep(actionEl, "down");
            runtime2.schedule(appRec, "move:down");
          } else if (n2.startsWith("move:to")) proxy && proxy.$move(a.value);
          else if (n2.startsWith("sort:")) runSort(actionEl, n2.slice(5), a.value, appRec);
        }
        if ([...actionEl.attributes].some((a) => a.name.startsWith("set:"))) runSet(actionEl, appRec);
      });
    }
    function onClick(e) {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      const appRec = runtime2.appFor(t);
      if (!appRec) return;
      const actionEl = findActionEl(t, appRec.root);
      if (!actionEl) return;
      runAction(actionEl, appRec);
    }
    function clearControl(c) {
      const cr = carrierFor(c);
      const def = c.getAttribute("default");
      if (cr.kind === "checkbox") cr.write(def === "" || def === "true");
      else cr.write(def != null ? def : "");
    }
    function addFromForm(formEl, appRec, listName) {
      const proxy = Sap2(formEl);
      if (!proxy) return;
      const newRow = proxy.$add(listName);
      if (!newRow) return;
      const composers = [];
      walkOwned(formEl, (el) => {
        if (el.hasAttribute("bind")) composers.push(el);
      });
      for (const c of composers) {
        if (c.type === "radio" && !c.checked) continue;
        const field = c.getAttribute("bind");
        const target = ownedBind(newRow.$el, field);
        if (target) carrierFor(target).write(carrierFor(c).read());
        else if (ownsField(newRow.$el, field)) newRow[field] = carrierFor(c).read();
      }
      composers.forEach(clearControl);
      if (composers.length) {
        if (typeof composers[0].focus === "function") composers[0].focus();
      } else {
        focusFirstEditable(newRow.$el);
      }
    }
    function onSubmit(e) {
      const form = e.target;
      if (!form || !form.hasAttribute || !form.hasAttribute("trigger-add")) return;
      const appRec = runtime2.appFor(form);
      if (!appRec) return;
      e.preventDefault();
      gateThenRun(form, appRec, () => addFromForm(form, appRec, form.getAttribute("trigger-add")));
    }
    function onDialogClose(e) {
      const dlg = e.target;
      if (!dlg || dlg.tagName !== "DIALOG" || !dlg.hasAttribute("detail")) return;
      if (dlg._sapEngineClose) {
        dlg._sapEngineClose = false;
        return;
      }
      if (dlg.open) return;
      const m = /^[\w.]+\s+by\s+state\.(\w+)\s*$/.exec(dlg.getAttribute("detail") || "");
      const appRec = runtime2.appFor(dlg);
      if (!m || !appRec) return;
      const own = parseStateDecl(dlg.getAttribute("state") || "").find((d) => d.name === m[1]);
      if (own) {
        if (own.transient) writeTransient(dlg, own, "");
        else writeDeclared(dlg, own, "");
        runtime2.schedule(appRec, "close");
        return;
      }
      const proxy = Sap2(dlg.parentElement);
      if (proxy && proxy[m[1]] !== "") proxy[m[1]] = "";
    }
    function routeInput(t, appRec) {
      const composer = t.hasAttribute("bind") && isComposer(t);
      if (!composer && t.hasAttribute("bind") && nearestViewRow(t)) {
        const field = t.getAttribute("bind");
        const target = t._sapViewBind ? accessor.writeTargetFor(t, field) : null;
        if (target) target[field] = carrierFor(t).read();
        return true;
      }
      const detailEl = isInsideDetail(t);
      if (detailEl && detailEl._sapDetailRow && t.hasAttribute("bind") && !composer) {
        const row = detailEl._sapDetailRow;
        const field = t.getAttribute("bind");
        const src = ownedBind(row, field);
        if (src && src !== t) {
          carrierFor(src).write(carrierFor(t).read());
          return true;
        }
        if (!src && parseStateDecl(row.getAttribute("state") || "").some((d) => d.name === field)) {
          accessor.writeField(row, appRec, field, carrierFor(t).read());
          return true;
        }
      }
      return false;
    }
    function install(doc = document) {
      doc.addEventListener("click", onClick);
      doc.addEventListener("submit", onSubmit);
      doc.addEventListener("close", onDialogClose, true);
    }
    return { install, routeInput };
  }

  // src/input.js
  function createInput(runtime2) {
    const routers = [];
    function onInput(e) {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      const appRec = runtime2.appFor(t);
      if (!appRec) return;
      if (t.hasAttribute("persist") && !regionSkipsSave(t)) serializeControlToAttributes(t);
      for (const route of routers) if (route(t, appRec)) return;
      runtime2.schedule(appRec, e.type + " " + (t.id || t.tagName.toLowerCase()));
    }
    function onReset(e) {
      const form = e.target;
      const appRec = runtime2.appFor(form);
      if (!appRec) return;
      setTimeout(() => {
        form.querySelectorAll("[bind]").forEach((c) => {
          c.dispatchEvent(new Event("input", { bubbles: true }));
          c.dispatchEvent(new Event("change", { bubbles: true }));
        });
        runtime2.schedule(appRec, "reset");
      }, 0);
    }
    function onToggle(e) {
      const appRec = runtime2.appFor(e.target);
      if (appRec) runtime2.schedule(appRec, "toggle");
    }
    function onSorted(e) {
      const d = e.detail || {};
      for (const el of [d.from, d.to, e.target]) {
        if (!el || el.nodeType !== 1) continue;
        const appRec = runtime2.appFor(el);
        if (appRec) runtime2.schedule(appRec, "sorted");
      }
    }
    function onKeydown(e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const t = e.target;
      if (!t || t.nodeType !== 1 || t.tagName !== "INPUT") return;
      if (!t.hasAttribute("bind") || !t.hasAttribute("step")) return;
      const type = (t.getAttribute("type") || "text").toLowerCase();
      if (type !== "text" && type !== "tel" && type !== "search") return;
      const appRec = runtime2.appFor(t);
      if (!appRec) return;
      e.preventDefault();
      const step = num(t.getAttribute("step")) || 1;
      const dir = e.key === "ArrowUp" ? 1 : -1;
      let next = num(t.value) + step * (e.shiftKey ? 10 : 1) * dir;
      const min2 = t.getAttribute("min"), max2 = t.getAttribute("max");
      if (min2 !== null && min2 !== "" && next < num(min2)) next = num(min2);
      if (max2 !== null && max2 !== "" && next > num(max2)) next = num(max2);
      carrierFor(t).write(String(Number(next.toFixed(2))));
    }
    function install(doc = document) {
      doc.addEventListener("reset", onReset);
      doc.addEventListener("toggle", onToggle, true);
      doc.addEventListener("input", onInput);
      doc.addEventListener("change", onInput);
      doc.addEventListener("clay:sorted", onSorted);
      doc.addEventListener("keydown", onKeydown);
    }
    return { install, addRouter: (fn) => routers.push(fn) };
  }

  // src/features/detail.js
  function resolvePathValue(path, ctx) {
    const segs = String(path).split(".");
    const walk = (o2) => {
      for (const s of segs) {
        if (o2 == null) return void 0;
        o2 = Array.isArray(o2) ? o2.flatMap((r) => r && r[s] != null ? r[s] : []) : o2[s];
      }
      return o2;
    };
    const o = walk(ctx.state);
    return o === void 0 ? walk(ctx.root) : o;
  }
  function resolveDetail(pass, el, parentObj, ctx) {
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
      keyVal = void 0;
    }
    const row = Array.isArray(arr) && keyVal != null ? arr.find((r) => r && typeof r === "object" && r.$el && String(r.$key) === String(keyVal)) : null;
    el._sapDetailRow = row ? row.$el : null;
    if (el.tagName === "DIALOG") {
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
    drainPlans();
    const dctx = { root: ctx.root, state: parentObj, item: row, ownerEl: row.$el, projection: true };
    pass.collectEl(el, planOf(el), dctx);
    pass.walkScope(el, row, dctx);
  }
  var detailFeature = {
    name: "detail",
    begin(pass) {
      pass.deferredDetails = [];
    },
    boundary: {
      detail(pass, el, plan, parentObj, ctx) {
        for (const d of parseStateDecl(el.getAttribute("state") || "")) {
          if (!(d.name in parentObj)) parentObj[d.name] = isPresenceDecl(el, d) ? el.hasAttribute(d.attr) : pass.resolveDefault(el, d);
        }
        pass.deferredDetails.push({ el, parentObj, ctx });
      }
    },
    afterIntake(pass) {
      for (let i = 0; i < pass.deferredDetails.length; i++) {
        const { el, parentObj, ctx } = pass.deferredDetails[i];
        resolveDetail(pass, el, parentObj, ctx);
      }
    }
  };

  // src/features/calc.js
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
  var calcFeature = {
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
      const groups = /* @__PURE__ */ new Map();
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
            c.owner[c.name] = void 0;
            app.diag.error("E24", c.el, { attr: "calc:" + c.name, expr: c.entry.src, problem: String(err.message) });
            setBeacon(c.el, err.sapCode || "E24");
          }
        }
      }
      pass.stats.calcs = pass.calcs.length;
      pass.stats.lists = groups.size;
    }
  };

  // src/features/each.js
  function placeAfter(parent, node, ref) {
    const before = ref.nextSibling;
    if (node.isConnected && parent.moveBefore) {
      try {
        parent.moveBefore(node, before);
        return;
      } catch {
      }
    }
    parent.insertBefore(node, before);
  }
  function drawnElFor(root, el, stateObj) {
    for (let cur = el.parentElement; cur; cur = cur.parentElement) {
      if (cur._sapScope === stateObj && !cur.hasAttribute("detail")) return cur;
      if (cur.hasAttribute("sap")) return cur;
    }
    return root;
  }
  function reconcileEach(pass, el, ctx) {
    const app = pass.app;
    el._sapDrawnEl = drawnElFor(pass.root, el, ctx.state);
    let tmpl = null;
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.tagName === "TEMPLATE") {
      tmpl = c;
      break;
    }
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
    const seen = /* @__PURE__ */ new Set();
    for (const item of list) {
      let k;
      try {
        k = runWith(keyEntry, ctx.state, item, el, ctx.root);
      } catch {
        k = void 0;
      }
      const ks = k == null ? "" : String(k);
      if (ks === "" || seen.has(ks)) {
        app.diag.error("E41", el, {
          attr: "key",
          expr: keyEntry.src,
          problem: ks === "" ? "an item has no key; the list keeps its last good rows" : `duplicate key "${ks}"; the list keeps its last good rows`
        });
        return 0;
      }
      seen.add(ks);
      keys.push(ks);
    }
    const prev = el._sapEach || /* @__PURE__ */ new Map();
    const next = /* @__PURE__ */ new Map();
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
    drainPlans();
    keys.forEach((k, i) => {
      const rowEl = next.get(k);
      const rctx = { root: ctx.root, state: ctx.state, item: list[i], ownerEl: rowEl, projection: false, view: true };
      pass.collectEl(rowEl, planOf(rowEl), rctx);
      pass.walkScope(rowEl, {}, rctx);
    });
    return changes;
  }
  var eachFeature = {
    name: "each",
    begin(pass) {
      pass.eachList = [];
    },
    boundary: {
      each(pass, el, plan, scopeObj, ctx) {
        pass.collectEl(el, plan, ctx);
        pass.eachList.push({ el, ctx });
      }
    },
    // Index loop: a nested each inside a row is pushed while the outer one is processed.
    reconcile(pass) {
      let changes = 0;
      for (let i = 0; i < pass.eachList.length; i++) changes += reconcileEach(pass, pass.eachList[i].el, pass.eachList[i].ctx);
      return changes;
    }
  };

  // src/features/effect.js
  function runEffect(e, app) {
    try {
      runWith(e.def.entry, e.ctx.state, e.ctx.item, e.el, e.ctx.root);
      clearBeacon(e.el);
    } catch (err) {
      app.diag.error("E24", e.el, { attr: "effect", expr: e.def.entry && e.def.entry.src, problem: String(err.message) });
      setBeacon(e.el, "E24");
    }
  }
  var effectFeature = {
    name: "effect",
    begin(pass) {
      pass.effects = [];
    },
    collect(pass, el, plan, ctx) {
      if (plan.effects) for (const def of plan.effects) pass.effects.push({ def, el, ctx });
    },
    afterPaint(pass) {
      for (const e of pass.effects) runEffect(e, pass.app);
    }
  };

  // src/features/validation.js
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
  var validationFeature = {
    name: "validation",
    begin(pass) {
      pass.invalids = [];
    },
    collect(pass, el, plan, ctx) {
      if (plan.invalids) for (const def of plan.invalids) pass.invalids.push({ def, el, ctx });
    },
    afterPaint(pass) {
      for (const iv of pass.invalids) runInvalid(iv);
    }
  };

  // src/features/projection.js
  function applyProjection(el, v) {
    if (el === el.ownerDocument.activeElement) return 0;
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
  var projectionFeature = {
    name: "projection",
    collect(pass, el, plan, ctx) {
      if (!(plan.bind != null && (ctx.view || ctx.projection) && !isComposer(el))) return;
      const field = plan.bind;
      const paints = pass.paints;
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
        pass.app.diag.error("E43", el, {
          attr: "bind",
          expr: field,
          problem: `bind="${field}" inside an each row matches no field of the row's record or of the scope the row is drawn in`,
          fix: "bind a field the record owns (bind, state= or items= on the [item]), or declare it with state= where the list is drawn"
        });
      }
    },
    paintKinds: {
      projection(p) {
        const def = p.def;
        if (def.from === "drawn") {
          const s = def.field in p.ctx.state ? p.ctx.state : p.ctx.root;
          return applyProjection(p.el, s[def.field]);
        }
        return applyProjection(p.el, p.ctx.item ? p.ctx.item[def.field] : "");
      }
    }
  };

  // src/features/index.js
  function registerFullFeatures() {
    for (const f of [detailFeature, calcFeature, eachFeature, effectFeature, validationFeature, projectionFeature]) registerFeature(f);
  }

  // src/sap.js
  registerFullFeatures();
  var { Sap, mountAll, mount, runtime } = createSap({
    createAccessor,
    installInput(runtime2, accessor, doc) {
      const input = createInput(runtime2);
      const actions = createActions(runtime2, accessor);
      input.addRouter(actions.routeInput);
      input.install(doc);
      actions.install(doc);
    }
  });
  var prior = typeof window !== "undefined" ? window.Sap : null;
  if (prior && prior !== Sap && prior.core && typeof prior.unmount === "function") prior.unmount();
  autoMount(mountAll);
  if (typeof window !== "undefined") window.Sap = Sap;
  var sap_default = Sap;
  return __toCommonJS(sap_exports);
})();
if (typeof window !== 'undefined' && Sap && Sap.default) window.Sap = Sap.default;
