// The frozen helper set and the format registry.
// These are passed into every compiled expression as the tail arguments.

export function num(v) {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function values(rows, k) {
  if (!Array.isArray(rows)) return [];
  if (k == null) return rows;
  return rows.map((r) => (typeof k === "function" ? k(r) : r == null ? undefined : r[k]));
}

export function sum(rows, k) {
  return values(rows, k).reduce((a, v) => a + num(v), 0);
}

export function count(rows, pred) {
  if (!Array.isArray(rows)) return 0;
  if (pred == null) return rows.length;
  return rows.reduce((a, r) => a + (pred(r) ? 1 : 0), 0);
}

export function avg(rows, k) {
  const v = values(rows, k);
  if (!v.length) return 0;
  return sum(rows, k) / v.length;
}

export function min(rows, k) {
  const v = values(rows, k).filter((x) => x != null && x !== "");
  if (!v.length) return 0;
  if (v.every((x) => typeof x === "number" || !Number.isNaN(Number(x)))) {
    return Math.min(...v.map(Number));
  }
  return v.reduce((a, b) => (String(a) <= String(b) ? a : b));
}

export function max(rows, k) {
  const v = values(rows, k).filter((x) => x != null && x !== "");
  if (!v.length) return 0;
  if (v.every((x) => typeof x === "number" || !Number.isNaN(Number(x)))) {
    return Math.max(...v.map(Number));
  }
  return v.reduce((a, b) => (String(a) >= String(b) ? a : b));
}

export function plural(n, singular, pluralForm) {
  const word = num(n) === 1 ? singular : pluralForm != null ? pluralForm : singular + "s";
  return `${n} ${word}`;
}

export function days(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(+da) || Number.isNaN(+db)) return 0;
  return Math.round((db - da) / 86400000);
}

function n(v) {
  return typeof v === "number" ? v : Number(v);
}

// The format registry. Extensible via Sap.formats.foo = fn.
export const formats = {
  usd: (v) => "$" + n(v).toLocaleString("en-US", { maximumFractionDigits: 0 }),
  usd2: (v) =>
    "$" + n(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct: (v) => Math.round(n(v)) + "%",
  pct1: (v) => n(v).toFixed(1) + "%",
  int: (v) => Math.round(n(v)).toLocaleString("en-US"),
  num: (v) => n(v).toLocaleString("en-US"),
  num2: (v) =>
    n(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
  },
};

const NUMERIC = new Set(["usd", "usd2", "pct", "pct1", "int", "num", "num2", "compact", "clock"]);

// Apply a named format. Numeric formats throw a tagged E22 error on non-finite input
// so paint can fail loudly rather than serialize "NaN".
export function applyFormat(name, v) {
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

// The bundle handed to every compiled expression, in frozen argument order.
export function helperBundle() {
  return [formats, num, sum, count, avg, min, max, plural, days];
}
