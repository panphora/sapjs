// Helpers for testing the shipped explainer doc (docs/sapjs-explained.html).
//
// The doc is a single self-contained file: the REAL engine (dist/sap.js) is
// inlined at build time and every demo's markup lives in a <script type="text/html">
// (or, for the one editable demo, a <textarea class="src-edit">). These helpers let
// the tests run those demos against the actual inlined engine, exactly as a browser
// would — no mocks, no re-import of src/.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// __dirname is available because babel-jest transpiles these ESM files to CommonJS
// (preset-env targets node:current). This keeps path resolution independent of cwd.
export const ROOT = join(__dirname, "..", "..");
export const DOC_PATH = join(ROOT, "docs", "sapjs-explained.html");
export const TEMPLATE_PATH = join(ROOT, "docs", "sapjs-explained.template.html");
export const DIST_PATH = join(ROOT, "dist", "sap.js");

export const docHtml = readFileSync(DOC_PATH, "utf8");

// The data-demo ids the page is expected to ship, grouped by the section each
// answers. Lets the structure tests assert "every question has a live demo" and
// catches a demo being silently dropped or renamed.
export const EXPECTED_DEMOS = {
  overview: ["overview-calc"],
  transient: ["transient-savedhtml", "transient-declared", "transient-filter"],
  richtext: ["richtext-contenteditable", "richtext-embed"],
  extending: ["extending-format"],
  setstate: ["set-bindmatrix", "set-tabs", "set-triggeradd", "set-batch", "set-kanban", "set-sort", "set-reset"],
  modals: ["modal-dialog"],
};

export const ALL_DEMO_IDS = Object.values(EXPECTED_DEMOS).flat();

// Verbatim copy of the page harness's dedent (template lines 951-958) so extracted
// markup is normalized identically to what the running page mounts.
export function dedent(s) {
  let lines = s.replace(/\t/g, "  ").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const widths = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const indent = widths.length ? Math.min.apply(null, widths) : 0;
  return lines.map((l) => l.slice(indent)).join("\n");
}

// Parse the file without executing anything (DOMParser never runs scripts or
// fetches resources), so we can inspect structure and pull demo markup safely.
export function parseDoc(html = docHtml) {
  return new DOMParser().parseFromString(html, "text/html");
}

// The inlined engine text, exactly as the browser would evaluate it: the content
// of the first attribute-less <script> (the demo blocks carry type="text/html";
// the harness <script> comes later in document order).
export function inlinedEngineCode(html = docHtml) {
  const doc = parseDoc(html);
  const engine = [...doc.querySelectorAll("script")].find((s) => !s.getAttribute("type"));
  return engine ? engine.textContent : "";
}

// Pull every demo: its data-demo id, dedented sap markup, and whether it is the
// editable (textarea-driven) demo. Mirrors the harness's source-of-truth lookup.
export function extractDemos(html = docHtml) {
  const doc = parseDoc(html);
  return [...doc.querySelectorAll(".demo[data-demo]")].map((demo) => {
    const ta = demo.querySelector("textarea.src-edit");
    const tpl = demo.querySelector('script[type="text/html"]');
    const raw = ta ? ta.textContent : tpl ? tpl.textContent : "";
    return { id: demo.getAttribute("data-demo"), markup: dedent(raw), editable: !!ta };
  });
}

// Evaluate the inlined engine into the jsdom window — precisely what the doc's
// <script> tag does at load — and return the real, shipped Sap. Registers the two
// custom formats the page registers before mount (harness lines 947-948) so the
// extending-format demo paints instead of throwing E22.
export function loadInlinedEngine() {
  if (!existsSync(DIST_PATH)) throw new Error(`missing ${DIST_PATH}; run npm run build`);
  document.body.innerHTML = "";
  const code = inlinedEngineCode();
  if (!code) throw new Error("could not extract the inlined engine from the doc");
  // eslint-disable-next-line no-new-func
  new Function(code)(); // sets window.Sap, exactly like the browser
  const Sap = window.Sap;
  Sap.formats.eur = (n) => "€" + Number(n).toFixed(2);
  Sap.config({ formats: { gbp: (n) => "£" + Number(n).toFixed(2) } });
  return Sap;
}
