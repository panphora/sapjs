// node test/bench/browser-bench.mjs [count ...]
// Times sapjs in headless Chromium on two page shapes: an items= todo list with
// a root count, and an each= index (filter + sort) over journal-shaped records.
// mount includes the browser's layout of the inserted markup; sapMount is Sap.mount
// alone. Each change is timed twice: through Sap.refresh() (a full re-read that
// rebuilds every directive plan), and as *Event, the path a user takes: the change,
// then the scheduled microtask pass and layout.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const COUNTS = process.argv.slice(2).map(Number).filter(Boolean);
if (!COUNTS.length) COUNTS.push(1000, 10000);
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path === "/bench.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end('<!doctype html><meta charset="utf-8"><body><script type="module">import Sap from "/src/sap.js"; window.Sap = Sap; window.ready = true;</script></body>');
    return;
  }
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();

function todoMarkup(n) {
  let rows = "";
  for (let i = 0; i < n; i++) {
    const done = i % 3 === 0;
    rows += `<li item data-id="t${i}" class:done="item.done"${done ? ' class="done"' : ""}><input type="checkbox" bind="done" persist${done ? " checked" : ""}><span bind="title">Task number ${i}</span></li>`;
  }
  const left = n - Math.ceil(n / 3);
  return `<main sap><ul items="todos"><li item template data-id="" class:done="item.done"><input type="checkbox" bind="done" persist><span bind="title"></span></li>${rows}</ul><output text="count(state.todos, t => !t.done) + ' left'">${left} left</output></main>`;
}

function journalMarkup(n) {
  const body = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
  let rows = "";
  for (let i = 0; i < n; i++) {
    const day = String(1 + (i % 28)).padStart(2, "0");
    const month = String(1 + (i % 12)).padStart(2, "0");
    rows += `<article item data-id="e${i}" state="data-date" data-date="2025-${month}-${day}"><textarea bind="body"># Entry ${i}\n${body}</textarea></article>`;
  }
  return `<main sap state="open:transient"><section items="entries"><article item template data-id="" state="data-date"><textarea bind="body"></textarea></article>${rows}</section><nav id="list" each="fmt.index(state.entries, state.q)"><template><a class="row" set:open="item.$key" class:on="state.open === item.$key"><b text="item.date"></b><span text="item.title"></span></a></template></nav><input id="q" bind="q" transient></main>`;
}

async function run(shape, n) {
  const page = await browser.newPage();
  await page.goto(`${base}/bench.html`);
  await page.waitForFunction(() => window.ready);
  const markup = shape === "todo" ? todoMarkup(n) : journalMarkup(n);
  const result = await page.evaluate(async ({ shape, markup }) => {
    const Sap = window.Sap;
    if (shape === "journal") {
      const cache = new Map();
      const title = (b) => {
        let t = cache.get(b);
        if (t === undefined) { t = b.split("\n")[0].replace(/^#\s*/, ""); cache.set(b, t); }
        return t;
      };
      Sap.config({ formats: { index: (entries, q) => entries
        .filter((e) => !q || e.body.includes(q))
        .map((e) => ({ $key: e.$key, $el: e.$el, date: e.date, title: title(e.body) }))
        .sort((a, b) => b.date.localeCompare(a.date)) } });
    }
    document.body.insertAdjacentHTML("beforeend", markup);
    const root = document.querySelector("[sap]");
    const t0 = performance.now();
    document.body.offsetHeight;
    const t1 = performance.now();
    Sap.mount(root);
    const sapMount = performance.now() - t1;
    document.body.offsetHeight;
    const mount = performance.now() - t0;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const median = (s) => {
      s.sort((x, y) => x - y);
      return +s[Math.floor(s.length / 2)].toFixed(1);
    };
    const time = async (fn, runs = 11) => {
      const s = [];
      for (let i = 0; i < runs; i++) {
        await tick();
        fn(i);
        const a = performance.now();
        Sap.refresh();
        document.body.offsetHeight;
        s.push(performance.now() - a);
      }
      return median(s);
    };
    const timeEvent = async (fn, runs = 11) => {
      const s = [];
      for (let i = 0; i < runs; i++) {
        await tick();
        const a = performance.now();
        fn(i);
        await Promise.resolve();
        await Promise.resolve();
        document.body.offsetHeight;
        s.push(performance.now() - a);
      }
      return median(s);
    };
    const out = { mount: +mount.toFixed(1), sapMount: +sapMount.toFixed(1), ok: Sap.status().ok };
    out.idle = await time(() => {});
    if (shape === "todo") {
      const toggle = (i) => {
        const box = document.querySelector('[data-id="t5"] input');
        box.checked = i % 2 === 0;
        box.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const title = (i) => { document.querySelector('[data-id="t7"] span').textContent = `Task seven ${i}`; };
      const devtools = () => { document.querySelector('[data-id="t9"] input').toggleAttribute("checked"); };
      out.toggle = await time(toggle);
      out.title = await time(title);
      out.devtools = await time(devtools);
      out.toggleEvent = await timeEvent(toggle);
      out.titleEvent = await timeEvent(title);
      out.devtoolsEvent = await timeEvent(devtools);
      out.check = document.querySelector("output").textContent;
    } else {
      const bodyEdit = (i) => {
        const ta = document.querySelector('[data-id="e5"] textarea');
        ta.value = `# Entry 5 edit ${i}\n` + ta.value.split("\n").slice(1).join("\n");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const reorder = (i) => { document.querySelector('[data-id="e9"]').setAttribute("data-date", `2026-0${1 + (i % 9)}-01`); };
      const search = (i) => {
        const q = document.querySelector("#q");
        q.value = i % 2 ? "" : "Entry 1";
        q.dispatchEvent(new Event("input", { bubbles: true }));
      };
      out.bodyEdit = await time(bodyEdit);
      out.reorder = await time(reorder);
      out.bodyEditEvent = await timeEvent(bodyEdit);
      out.reorderEvent = await timeEvent(reorder);
      out.search = await time(search);
      out.searchEvent = await timeEvent(search);
      out.check = document.querySelectorAll("#list > a.row").length;
    }
    return out;
  }, { shape, markup });
  await page.close();
  return result;
}

for (const n of COUNTS) {
  for (const shape of ["todo", "journal"]) {
    const r = await run(shape, n);
    console.log(`${shape.padEnd(8)} ${String(n).padStart(6)}  ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join("   ")}`);
  }
}
await browser.close();
server.close();
