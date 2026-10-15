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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./site.css">
<style>
  * { box-sizing: border-box; }
  body { font: 16px/1.65 Inter, system-ui, sans-serif; }
  a { color: var(--accent); }
  .wrap { max-width: 820px; margin: 0 auto; padding: 40px 24px 96px; }
  h1, h2, h3, h4 { font-family: Fraunces, Georgia, serif; font-weight: 600; letter-spacing: -.01em; line-height: 1.2; position: relative; }
  h1 { font-size: clamp(32px, 5vw, 44px); margin: 0 0 16px; }
  h2 { font-size: 26px; margin: 56px 0 12px; padding-top: 16px; border-top: 1px solid var(--rule); }
  h3 { font-size: 20px; margin: 32px 0 8px; }
  .anchor { position: absolute; left: -1em; color: var(--ink-3); opacity: 0; font-weight: 400; text-decoration: none; }
  h2:hover .anchor, h3:hover .anchor, h4:hover .anchor { opacity: 1; }
  code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .86em; background: var(--code-bg); border-radius: 5px; padding: 1px 6px; overflow-wrap: anywhere; }
  pre.block { background: var(--code-bg); border-radius: 12px; padding: 16px 18px; overflow-x: auto; font: 13.5px/1.55 "JetBrains Mono", ui-monospace, monospace; }
  pre.block code { background: none; padding: 0; font-size: inherit; overflow-wrap: normal; }
  table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; font-size: 14.5px; }
  th, td { border: 1px solid var(--rule); padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: var(--paper); }
  blockquote { margin: 0; padding-left: 16px; border-left: 3px solid var(--accent); color: var(--ink-2); }
  details.toc { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 10px 16px; margin: 24px 0; }
  details.toc summary { cursor: pointer; font: 500 14px Inter, system-ui, sans-serif; color: var(--ink-2); }
  ul li:has(> input[type=checkbox]) { list-style: none; margin-left: -1.4em; }
  @media (max-width: 760px) { .wrap { padding: 28px 16px 72px; } pre.block { font-size: 12.5px; padding: 14px; } }
</style>
</head>
<body>
<header class="site-nav">
  <div class="nav-inner">
    <a class="brand" href="./"><img src="./favicon.svg" alt="" width="24" height="24">sapjs</a>
    <nav>
      <a href="./guide.html" aria-current="page">Guide</a>
      <a href="./how-it-works.html">How it works</a>
      <a href="./demos.html">Demos</a>
      <a href="./llms.txt">llms.txt</a>
      <a href="https://github.com/panphora/sapjs">GitHub</a>
    </nav>
  </div>
</header>
<div class="wrap">
<details class="toc"><summary>Contents</summary><ol>${toc.join("")}</ol></details>
${content}
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
<script src="https://hyperclay.com/public/js/polite-pop.js" defer></script>
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
