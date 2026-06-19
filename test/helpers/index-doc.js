// Helpers for testing the public homepage (index.html).
//
// Unlike the explainer (docs/sapjs-explained.html), index.html is hand-authored
// source, not generated, and it loads the engine over a <script src="./dist/sap.min.js">
// tag rather than inlining it. So these helpers parse the page for structure and
// extract each demo's markup, then load the readable dist/sap.js build directly to
// mount those demos against the real, shipped engine — exactly as the browser would.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// __dirname is available because babel-jest transpiles these ESM files to CommonJS.
export const ROOT = join(__dirname, "..", "..");
export const INDEX_PATH = join(ROOT, "index.html");
export const DIST_PATH = join(ROOT, "dist", "sap.js");

export const indexHtml = readFileSync(INDEX_PATH, "utf8");

// The hero demo lives in a section with no id; the rest live under a section id.
// Grouping lets the structure tests assert "this section ships these demos" and
// catches a demo being silently dropped or renamed.
export const HERO_DEMO = "overview-calc";
export const EXPECTED_DEMOS = {
  demos: [
    "todo", "sort", "modal-dialog", "filter", "kanban", "validation",
    "tabs", "batch", "set-reset", "set-bindmatrix", "accordion",
  ],
  persistence: ["transient-savedhtml"],
  text: ["richtext-contenteditable", "richtext-embed"],
};

export const ALL_DEMO_IDS = [HERO_DEMO, ...Object.values(EXPECTED_DEMOS).flat()];

// Verbatim copy of the page harness's dedent so extracted markup is normalized
// identically to what the running page mounts.
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
export function parseDoc(html = indexHtml) {
  return new DOMParser().parseFromString(html, "text/html");
}

// Pull every demo: its data-demo id, dedented sap markup, and whether it is the
// editable (textarea-driven) demo. Mirrors the page harness's source-of-truth lookup.
export function extractDemos(html = indexHtml) {
  const doc = parseDoc(html);
  return [...doc.querySelectorAll(".demo[data-demo]")].map((demo) => {
    const ta = demo.querySelector("textarea.src-edit");
    const tpl = demo.querySelector('script[type="text/html"]');
    const raw = ta ? ta.textContent : tpl ? tpl.textContent : "";
    return { id: demo.getAttribute("data-demo"), markup: dedent(raw), editable: !!ta };
  });
}

// Evaluate the shipped engine into the jsdom window — precisely what the page's
// <script src="./dist/sap.min.js"> does at load — and return the real Sap. The
// homepage registers no custom formats, so nothing else to seed.
export function loadEngine() {
  if (!existsSync(DIST_PATH)) throw new Error(`missing ${DIST_PATH}; run npm run build`);
  document.body.innerHTML = "";
  const code = readFileSync(DIST_PATH, "utf8");
  // eslint-disable-next-line no-new-func
  new Function(code)(); // sets window.Sap, exactly like the browser
  return window.Sap;
}
