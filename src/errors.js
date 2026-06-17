// Error grammar, the E-code registry, the teaching dictionary, beacons, and
// per-app diagnostics that drive the green line and Sap.report().

export const REGISTRY = {
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
  W30: { slug: "nonzero-mount-writes", behavior: "WARN" },
};

export const NATIVE_BOOLEANS = [
  "disabled", "readonly", "required", "checked", "selected",
  "multiple", "open", "inert", "autofocus", "novalidate", "hidden",
];

export const HTML_GLOBALS = new Set([
  "title", "style", "hidden", "lang", "dir", "translate", "class", "id",
  "nonce", "autofocus", "tabindex", "contenteditable", "spellcheck",
  "draggable", "role", "slot", "part", "name", "value", "type",
]);

export const RESERVED = new Set([
  "sap", "scope", "items", "item", "template", "bind", "calc", "text", "show",
  "attr", "set", "trigger", "move", "sort", "detail", "effect", "invalid",
  "confirm", "transient", "default", "persist", "sortable", "editmode",
]);

export function cssPath(el) {
  if (!el || el.nodeType !== 1) return "?";
  if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
  const parts = [];
  let cur = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < 4) {
    let seg = cur.tagName.toLowerCase();
    if (cur.hasAttribute("sap")) seg += "[sap]";
    else if (cur.parentElement) {
      const sibs = [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName);
      if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
    }
    parts.unshift(seg);
    if (cur.hasAttribute("sap")) break;
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(" > ");
}

// Translate a foreign-dialect attribute to its Sap spelling, or null if unknown.
export function teachForAttr(name) {
  const n = name.toLowerCase();
  if (/^x-text$|^x-html$/.test(n)) return `use text="state.x" (Sap paints text only)`;
  if (/^x-show$|^v-show$|^v-if$/.test(n)) return `use show="expr" (toggles native hidden)`;
  if (/^x-model$|^v-model$/.test(n)) return `use bind="field"`;
  if (/^@|^x-on:|^v-on:|^on:/.test(n)) return `use native onclick + Sap(this) (no event directive)`;
  if (/^:|^x-bind:class$|^v-bind:class$/.test(n)) return `use class:NAME="expr" or attr:NAME="expr"`;
  if (/^x-for$|^v-for$/.test(n)) return `use items="name" on the container and item template on the row`;
  if (/^x-data$/.test(n)) return `declare state with state= / bind / items (no JS state object)`;
  if (/^x-init$/.test(n)) return `use a <script> or onclick + Sap(this)`;
  if (/^bind:/.test(n)) return `use bind="field"; one-way paint is attr:NAME="expr"`;
  if (/^x-/.test(n) || /^v-/.test(n)) return `this is a foreign-dialect attribute; Sap has no x-/v- attributes`;
  return null;
}

export class HaltError extends Error {
  constructor(code, message) {
    super(message);
    this.sapCode = code;
    this.isHalt = true;
  }
}

// Per-app diagnostics collector.
export class Diagnostics {
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
      phase: info.phase || "runtime",
    };
    const out = ["\n" + (code[0] === "W" ? "sap ⚠ " : "sap ✗ ") + code + " " + slug];
    out.push(`  at ${rec.el}${rec.attr ? ` — ${rec.attr}="${rec.expr ?? ""}"` : ""}`);
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
      warnings: this.warnings.slice(),
    };
  }
}

export function setBeacon(el, code) {
  if (el && el.getAttribute("sap-error") !== code) el.setAttribute("sap-error", code);
}

export function clearBeacon(el) {
  if (el && el.hasAttribute("sap-error")) el.removeAttribute("sap-error");
}

// Levenshtein-based did-you-mean against a set of candidate names.
export function didYouMean(name, candidates) {
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
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}
