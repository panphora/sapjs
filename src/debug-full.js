// The full-only console tools. why re-derives one element's resolution and doctor
// audits the whole page; both are pure DOM re-derivations that retain nothing.
// The core leaves them out and names full sapjs instead.

import { cssPath, Diagnostics } from "./errors.js";
import { lintApp } from "./lint.js";
import { runPass } from "./pass.js";
import { parseStateDecl } from "./dom.js";
import { rootLabel } from "./debug.js";

function exprSources(root) {
  const out = [];
  const scan = (el) => {
    for (const a of el.attributes) {
      const n = a.name;
      if (
        n.startsWith("calc:") || n === "text" || n.startsWith("text:") || n === "show" ||
        n.startsWith("attr:") || n.startsWith("class:") || n.startsWith("css:") ||
        n === "effect" || n === "invalid" || n.startsWith("set:") || n === "detail"
      ) out.push({ el, attr: n, src: a.value });
    }
  };
  scan(root);
  for (const el of root.querySelectorAll("*")) scan(el);
  return out;
}

export function addFullDebug(runtime) {
  function resolveEl(elOrSel) {
    if (!elOrSel) return null;
    if (typeof elOrSel === "string") return document.querySelector(elOrSel);
    return elOrSel.nodeType === 1 ? elOrSel : null;
  }

  function why(elOrSel, field) {
    const el = resolveEl(elOrSel);
    if (!el) { console.warn("sap why: element not found"); return null; }
    const lines = [`sap why <${el.tagName.toLowerCase()}> — ${cssPath(el)}`];
    const sapAttrs = [...el.attributes].filter((a) =>
      /^(bind|text|show|effect|invalid|detail|calc:|text:|attr:|class:|css:|set:|state|items|scope)/.test(a.name));
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

  function doctor() {
    const findings = [];
    let checks = 0;
    for (const app of runtime.apps()) {
      const root = app.root;
      const label = rootLabel(root);

      // 1. lint re-run
      checks++;
      const d2 = new Diagnostics(app.name);
      lintApp(root, d2);
      for (const e of d2.errors) findings.push({ code: e.code, severity: "error", message: `${label}: ${e.code} ${e.slug} at ${e.el}` });
      for (const w of d2.warnings) findings.push({ code: w.code, severity: "warn", message: `${label}: ${w.code} ${w.slug} at ${w.el}` });

      // 2. consistency dry-run: a quiet page should write nothing
      checks++;
      runPass(app, { trigger: "doctor-dryrun" });
      const w = app._stats ? app._stats.writes : 0;
      if (w > 0) findings.push({ code: "W30", severity: "warn", message: `${label}: dry recompute wrote ${w} cells on a quiet page; an element is stale or non-idempotent` });

      // 3. dead state: declared fields read nowhere
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

      // 4. duplicate ids
      checks++;
      const ids = new Map();
      for (const el of root.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) || 0) + 1);
      for (const [id, n] of ids) if (n > 1) findings.push({ code: "W32", severity: "warn", message: `${label}: duplicate id "${id}" (${n} elements) — clone/edit collision` });

      // 5. long expressions (suggest calc:)
      checks++;
      for (const s of exprSources(root)) {
        if (s.src.length > 120) findings.push({ code: "I33", severity: "info", message: `${label}: ${s.attr} expression is ${s.src.length} chars; consider a calc: field` });
      }

      // 6. unformatted float paints
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
    console.log(`sap doctor · ${runtime.apps().map((a) => rootLabel(a.root)).join(", ")} · errors ${e} · warnings ${wn} · info ${i} · ${checks} checks · ${ms}ms`);
    for (const f of findings) {
      const fn = f.severity === "error" ? console.error : f.severity === "warn" ? console.warn : console.info;
      fn(`  ${f.severity === "error" ? "✗" : f.severity === "warn" ? "⚠" : "·"} ${f.message}`);
    }
    return findings;
  }

  return { why, doctor };
}
