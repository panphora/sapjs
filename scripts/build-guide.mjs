// Render guide.md (repo root) to guide.html for saphtml.com. Runs in `npm run build`,
// so the page can never drift from the Markdown. The worked-app info strings
// (```html app=NAME) are test hooks; they render as ordinary html code blocks.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(join(root, "guide.md"), "utf8");

const slug = (text) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const toc = [];
const used = new Set();
let title = "sapjs guide";
const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      if (depth === 1) {
        title = html.replace(/<[^>]+>/g, "");
        return `<h1>${html}</h1>\n`;
      }
      let id = slug(html);
      const base = id;
      for (let n = 1; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      if (depth === 2) toc.push(`<li><a href="#${id}">${html.replace(/<[^>]+>/g, "")}</a></li>`);
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}">#</a>${html}</h${depth}>\n`;
    },
    code({ text, lang }) {
      const language = (lang || "").split(/\s+/)[0];
      return `<pre class="block"><code${language ? ` class="language-${language}"` : ""}>${esc(text)}</code></pre>\n`;
    },
  },
});

const content = marked.parse(md);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="How to build malleable document apps (trackers, boards, notes) in one HTML file with sapjs and ClayJS.">
<link rel="canonical" href="https://saphtml.com/guide.html">
<link rel="alternate" type="text/markdown" href="./guide.md">
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
<style>
  :root {
    --bg: #0a0c10; --panel: #11151c; --border: #232b38; --text: #d8dee9; --muted: #8b97a8;
    --accent: #6ee7a8; --accent-dim: #3aa776; --code-bg: #0c0f15;
    --mono: "Berkeley Mono", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 16px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrap { max-width: 820px; margin: 0 auto; padding: 32px 16px 96px; }
  nav.top { display: flex; gap: 18px; font-family: var(--mono); font-size: 14px; margin-bottom: 32px; flex-wrap: wrap; }
  nav.top b { color: var(--text); }
  h1, h2, h3, h4 { line-height: 1.25; letter-spacing: -0.01em; position: relative; }
  h1 { font-size: 34px; margin: 0 0 16px; }
  h2 { font-size: 24px; margin: 56px 0 12px; padding-top: 16px; border-top: 1px solid var(--border); }
  h3 { font-size: 19px; margin: 32px 0 8px; }
  .anchor { position: absolute; left: -1em; color: var(--accent-dim); opacity: 0; font-weight: 400; }
  h2:hover .anchor, h3:hover .anchor, h4:hover .anchor { opacity: 1; }
  code { font-family: var(--mono); font-size: 0.9em; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }
  pre.block { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-size: 13.5px; line-height: 1.5; }
  pre.block code { background: none; border: 0; padding: 0; font-size: inherit; }
  table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; font-size: 14.5px; }
  th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: var(--panel); }
  blockquote { margin: 0; padding-left: 16px; border-left: 3px solid var(--accent-dim); color: var(--muted); }
  details.toc { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; margin: 24px 0; }
  details.toc summary { cursor: pointer; font-family: var(--mono); font-size: 14px; color: var(--muted); }
  ul li:has(> input[type=checkbox]) { list-style: none; margin-left: -1.4em; }
</style>
</head>
<body>
<div class="wrap">
<nav class="top"><a href="./"><b>sapjs</b></a><a href="./guide.md">guide.md</a><a href="./llms.txt">llms.txt</a><a href="./docs/sapjs-explained.html">explainer</a></nav>
<details class="toc"><summary>Contents</summary><ol>${toc.join("")}</ol></details>
${content}
</div>
</body>
</html>
`;

const out = join(root, "guide.html");
if (process.argv.includes("--check")) {
  if (readFileSync(out, "utf8") !== page) {
    console.error("guide.html is stale: run npm run build:guide");
    process.exit(1);
  }
  console.log("build:guide --check: guide.html is current");
} else {
  writeFileSync(out, page, "utf8");
  console.log(`build:guide → guide.html (${Buffer.byteLength(page)} bytes, ${toc.length} sections)`);
}
