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
    function runWithBreaker(app) {
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
      runPass2(app);
    }
    function runNow(app, trigger) {
      note(trigger);
      runWithBreaker(app);
    }
    function rearm(app) {
      app._broken = false;
      app._passes = 0;
    }
    return { schedule, runNow, rearm, ring };
  }

  // src/dom.js
  var idSeq = 0;
  function ensureId(el, prefix = "sap") {
    if (!el.id) el.id = `${prefix}-${(idSeq++).toString(36)}`;
    return el.id;
  }
  function isScopeBoundary(el) {
    return el.hasAttribute("scope") || el.hasAttribute("items") || el.hasAttribute("detail");
  }
  function isInert(el) {
    return el.hasAttribute("sap-ignore") || el.hasAttribute("template");
  }
  function walkOwned(scopeEl, visit) {
    for (const child of scopeEl.children) descend(child);
    function descend(el) {
      if (el.nodeType !== 1) return;
      if (isInert(el)) return;
      const boundary = isScopeBoundary(el);
      visit(el, boundary);
      if (!boundary) for (const c of el.children) descend(c);
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
  function rowsOf(listEl) {
    return [...listEl.children].filter((c) => c.hasAttribute("item") && !c.hasAttribute("template"));
  }
  function templateOf(listEl) {
    return [...listEl.children].find((c) => c.hasAttribute("item") && c.hasAttribute("template")) || null;
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
        else if (p === "transient") transient = true;
      }
      out.push({ name, type, default: def, transient });
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
  function readTransient(el, decl) {
    const store = el._sapTransient || (el._sapTransient = {});
    if (!(decl.name in store)) {
      let raw = el.getAttribute(decl.name);
      if (raw == null) raw = decl.default != null ? decl.default : decl.type === "num" ? "0" : decl.type === "bool" ? "false" : "";
      store[decl.name] = parseTyped(raw, decl.type);
    }
    if (el.hasAttribute(decl.name)) el.removeAttribute(decl.name);
    return store[decl.name];
  }
  function writeTransient(el, decl, value) {
    (el._sapTransient || (el._sapTransient = {}))[decl.name] = value;
    if (el.hasAttribute(decl.name)) el.removeAttribute(decl.name);
  }
  function resolveListEl(appRoot, fromEl, path) {
    const segs = String(path).split(".");
    const listName = segs[segs.length - 1];
    if (segs.length === 1) {
      const up = findItemsUp(fromEl, listName);
      if (up) return up;
      if (appRoot.getAttribute("items") === listName) return appRoot;
      return appRoot.querySelector(`[items="${listName}"]`);
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
    const n2 = Number(v);
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
  function helperBundle() {
    return [formats, num, sum, count, avg, min, max, plural, days];
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
    if (entry.error) throw entry.error;
    return entry.fn(ctx.state, ctx.item, ctx.el ?? null, ctx.root, ...helperBundle());
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
  function mirror(el, kind) {
    if (el.hasAttribute("transient")) {
      el.removeAttribute("value");
      el.removeAttribute("checked");
      return;
    }
    switch (kind) {
      case "checkbox":
      case "radio":
        if (el.checked) el.setAttribute("checked", "");
        else el.removeAttribute("checked");
        break;
      case "number":
      case "text":
      case "hidden":
        el.setAttribute("value", el.value);
        break;
      default:
        break;
    }
  }
  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
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
        if (!opts.noMirror) mirror(el, kind);
        if (!opts.silent) fire(el);
      },
      mirror() {
        mirror(el, kind);
      }
    };
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
    W03: { slug: "unknown-colon-attribute", behavior: "WARN" },
    W30: { slug: "nonzero-mount-writes", behavior: "WARN" }
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
    "type"
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
    "effect",
    "invalid",
    "confirm",
    "transient",
    "default",
    "persist",
    "sortable",
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
        const sibs = [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName);
        if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
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
      console.error(out.join("\n"));
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

  // src/pass.js
  var NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);
  function runPass(app, opts = {}) {
    if (opts.breaker) {
      app.diag.error("E26", app.root, {
        problem: "recompute loop halted after 50 passes; recent triggers: " + (app._breakerRing || []).join(", ")
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
          obj[d.name] = el.hasAttribute(d.name);
          continue;
        }
        if (d.transient) {
          obj[d.name] = readTransient(el, d);
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
        el.removeAttribute("value");
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
      for (const s of segs) o = o == null ? void 0 : o[s];
      if (o === void 0) {
        o = ctx.root;
        for (const s of segs) o = o == null ? void 0 : o[s];
      }
      return o;
    }
    function handleDetail(el, parentObj, ctx) {
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
        keyVal = void 0;
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
    enterScope(root, rootObj, rootCtx);
    const groups = /* @__PURE__ */ new Map();
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
          c.owner[c.name] = void 0;
          app.diag.error("E24", c.el, { attr: "calc:" + c.name, expr: c.entry.src, problem: String(err.message) });
          setBeacon(c.el, err.sapCode || "E24");
        }
      }
    }
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
      writes
    };
    app._lastPass = { trigger: opts.trigger || "refresh", writes };
    if (app._debug) {
      console.log(`sap pass \xB7 trigger: ${app._lastPass.trigger} \xB7 writes ${writes}/${paints.length}`);
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
    if (el === el.ownerDocument.activeElement) return 0;
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
      const n2 = applyPaint(p, value);
      clearBeacon(p.el);
      return n2;
    } catch (err) {
      app.diag.error(err.sapCode === "E22" ? "E22" : "E24", p.el, {
        attr: paintAttrName(p),
        expr: p.entry && p.entry.src,
        problem: String(err.message)
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

  // src/lint.js
  var NATIVE_BOOLEAN_SET2 = new Set(NATIVE_BOOLEANS);
  var COLON_PREFIXES = /* @__PURE__ */ new Set(["calc", "text", "attr", "class", "css", "set", "move", "sort", "option", "editmode"]);
  function isControl(el) {
    return el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA";
  }
  function isBound(el) {
    return el.hasAttribute("bind");
  }
  function walkAll(root, visit) {
    visit(root);
    for (const child of root.children) descend(child);
    function descend(el) {
      if (el.nodeType !== 1) return;
      if (el.hasAttribute("sap-ignore") || el.hasAttribute("template")) {
        if (el.hasAttribute("sap-ignore")) return;
      }
      visit(el);
      for (const c of el.children) descend(c);
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
          }
        }
        if (name === "attr:hidden") {
          diag.warn("W03", el, { attr: name, problem: "attr:hidden paints the wrong attribute", fix: 'use show="expr"' });
        }
        if ((name === "attr:value" || name === "attr:checked" || name === "attr:selected") && isBound(el)) {
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
          if (RESERVED.has(d.name)) halt("E05", el, { attr: "state", problem: `"${d.name}" is a reserved Sap word` });
          if (HTML_GLOBALS.has(d.name)) halt("E06", el, { attr: "state", problem: `"${d.name}" is a global HTML attribute name; pick another field name` });
          if (d.name === "open" && el.tagName === "DIALOG") {
            halt("E33", el, { attr: "state", problem: "dialog open is transient", fix: "use showModal() \u2014 declare state= only on <details> or popovers" });
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
      if (el.hasAttribute("item") && !el.hasAttribute("template")) {
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
        if (!templateOf(el) && rowsOf(el).length === 0 && targeted) {
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
    const t0 = now();
    runPass(appRec, { trigger: "mount" });
    appRec._mountMs = now() - t0;
    appRec._mountWrites = appRec._stats ? appRec._stats.writes : 0;
    if (appRec._mountWrites > 0) {
      diag.warn("W30", root, {
        problem: `${appRec._mountWrites} paint(s) ran at mount; the saved file was out of sync with its declared state`,
        fix: "re-save once so the file mounts clean (a settled file writes nothing)"
      });
    }
    return appRec;
  }

  // src/scope.js
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
        return parseTyped(decl.el.getAttribute(field), decl.decl.type);
      }
      const snap = ctxEl._sapScope;
      return snap ? snap[field] : void 0;
    }
    function setStateAttr(el, field, value, decl, appRec) {
      if (decl.transient) writeTransient(el, decl, value);
      else el.setAttribute(field, serializeTyped(value, decl.type));
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
      setStateAttr(root, field, value, { name: field, type, transient: false }, appRec);
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
        const dflt = d.default != null ? d.default : d.type === "num" ? "0" : d.type === "bool" ? "false" : "";
        if (d.transient) writeTransient(ctxEl, d, parseTyped(dflt, d.type));
        else ctxEl.setAttribute(d.name, dflt);
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
          return ensureId(ctxEl, isRow ? "row" : "scope");
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
    return { Sap: Sap2, contextElFor, readField, writeField, makeProxy };
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
  function createActions(runtime2, accessor2) {
    const { Sap: Sap2 } = accessor2;
    function actionCtx(el, appRec) {
      let item = null;
      const detailEl = isInsideDetail(el);
      if (detailEl && detailEl._sapDetailRow) item = detailEl._sapDetailRow._sapScope || null;
      else {
        const itemEl = nearestItemEl(el);
        if (itemEl && itemEl.hasAttribute("item")) item = itemEl._sapScope || null;
      }
      const scopeEl = nearestScopeEl(el) || appRec.root;
      const state = scopeEl._sapScope || appRec._state || {};
      return { state, item, el, root: appRec._state || {} };
    }
    function confirmGate(el, appRec) {
      if (!el.hasAttribute("confirm")) return true;
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
      return window.confirm(msg);
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
        const proxy = Sap2(el);
        if (proxy) proxy[field] = value;
      }
    }
    function moveStep(el, dir) {
      const row = el.closest("[item]");
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
      if (!confirmGate(actionEl, appRec)) return;
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
        const target = ownedBind(newRow.$el, c.getAttribute("bind"));
        if (target) carrierFor(target).write(carrierFor(c).read());
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
      if (!confirmGate(form, appRec)) return;
      addFromForm(form, appRec, form.getAttribute("trigger-add"));
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
    function onInput(e) {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      const appRec = runtime2.appFor(t);
      if (!appRec) return;
      const detailEl = isInsideDetail(t);
      if (detailEl && detailEl._sapDetailRow && t.hasAttribute("bind")) {
        const src = ownedBind(detailEl._sapDetailRow, t.getAttribute("bind"));
        if (src && src !== t) {
          carrierFor(src).write(carrierFor(t).read());
          return;
        }
      }
      runtime2.schedule(appRec, e.type + " " + (t.id || t.tagName.toLowerCase()));
    }
    function install(doc = document) {
      doc.addEventListener("click", onClick);
      doc.addEventListener("submit", onSubmit);
      doc.addEventListener("reset", onReset);
      doc.addEventListener("toggle", onToggle, true);
      doc.addEventListener("input", onInput);
      doc.addEventListener("change", onInput);
    }
    return { install };
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

  // src/platform.js
  function batch(label, fn) {
    if (typeof fn !== "function") throw new Error("Sap.batch(label, fn): fn must be a function");
    const u = typeof window !== "undefined" && window.hyperclay && window.hyperclay.undo;
    if (u && u.flush) u.flush();
    const r = fn();
    if (r && typeof r.then === "function") throw new Error("Sap.batch fn must be synchronous (it returned a promise)");
    if (u && u.commitCaptured) u.commitCaptured(label);
    return r;
  }
  function installBridges(runtime2) {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const refreshConnected = () => {
      for (const app of runtime2.apps()) {
        if (app.root.isConnected) runtime2.runNow(app, "platform");
        else runtime2.remountIfPresent();
      }
    };
    document.addEventListener("hyperclay:livesync-applied", refreshConnected);
    const undo = window.hyperclay && window.hyperclay.undo;
    if (undo && typeof undo.on === "function") {
      undo.on("undo", refreshConnected);
      undo.on("redo", refreshConnected);
    } else {
      window.addEventListener("hyperclay:mutation-ready", () => {
        const u = window.hyperclay && window.hyperclay.undo;
        if (u && typeof u.on === "function") {
          u.on("undo", refreshConnected);
          u.on("redo", refreshConnected);
        }
      });
    }
  }

  // src/sap.js
  var VERSION = "0.2.0";
  var registry = /* @__PURE__ */ new Map();
  var order = [];
  var scheduler = createScheduler(runPass);
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
  var runtime = {
    apps: () => order.slice(),
    appFor,
    schedule: (app, trigger) => scheduler.schedule(app, trigger),
    runNow: (app, trigger) => scheduler.runNow(app, trigger),
    moveInto,
    placeBefore,
    remountIfPresent: () => mountAll()
  };
  var accessor = createAccessor(runtime);
  var actions = createActions(runtime, accessor);
  var debugApi = createDebug(runtime);
  var installed = false;
  function installOnce() {
    if (installed) return;
    installed = true;
    actions.install(document);
    installBridges(runtime);
  }
  function mountAll(docRoot = document) {
    installOnce();
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
    return fresh;
  }
  function mount(rootOrSel) {
    installOnce();
    if (!rootOrSel) return mountAll();
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
  var Sap = accessor.Sap;
  Sap.version = VERSION;
  Sap.refresh = function refresh() {
    for (const app of order) if (app.root.isConnected) scheduler.runNow(app, "refresh");
  };
  Sap.batch = batch;
  Sap.status = debugApi.status;
  Sap.report = debugApi.report;
  Sap.why = debugApi.why;
  Sap.debug = debugApi.debug;
  Sap.doctor = debugApi.doctor;
  Sap.greenLine = debugApi.greenLine;
  Sap.formats = formats;
  Sap.mount = mount;
  Sap.config = function config(options = {}) {
    if (options.formats) Object.assign(formats, options.formats);
    return Sap;
  };
  Sap._registry = registry;
  Sap._reset = function reset() {
    registry.clear();
    order.length = 0;
  };
  function autoMount() {
    if (typeof document === "undefined") return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => mountAll());
    } else {
      mountAll();
    }
  }
  autoMount();
  if (typeof window !== "undefined") window.Sap = Sap;
  var sap_default = Sap;
  return __toCommonJS(sap_exports);
})();
if (typeof window !== 'undefined' && Sap && Sap.default) window.Sap = Sap.default;
