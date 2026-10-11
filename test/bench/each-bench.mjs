// node test/bench/each-bench.mjs [count]
// Measures sap passes over N journal-shaped records projected through each=.
import { JSDOM } from "jsdom";

const N = Number(process.argv[2] || 1000);
const BODY = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);

function records(n) {
  let html = "";
  for (let i = 0; i < n; i++) {
    const day = String(1 + (i % 28)).padStart(2, "0");
    const month = String(1 + (i % 12)).padStart(2, "0");
    html += `<article item data-id="e${i}" state="data-date" data-date="2025-${month}-${day}"><textarea bind="body"># Entry ${i}\n${BODY}</textarea></article>`;
  }
  return html;
}

const titleCache = new Map();
const title = (body) => {
  let t = titleCache.get(body);
  if (t === undefined) {
    t = body.split("\n")[0].replace(/^#\s*/, "");
    titleCache.set(body, t);
  }
  return t;
};

const markup = `
<main sap state="open:transient">
  <section items="entries">
    <article item template data-id="" state="data-date"><textarea bind="body"></textarea></article>
    ${records(N)}
  </section>
  <nav id="list" each="fmt.index(state.entries, state.q)">
    <template><a class="row" set:open="item.$key" class:on="state.open === item.$key"><b text="item.date"></b><span text="item.title"></span></a></template>
  </nav>
  <input id="q" bind="q" transient>
</main>`;

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
for (const key of ["window", "document", "Node", "Element", "HTMLElement", "MutationObserver", "CustomEvent", "Event", "getComputedStyle"]) {
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
}

const { default: Sap } = await import("../../src/sap.js");
Sap.config({
  formats: {
    index: (entries, q) => entries
      .filter((e) => !q || e.body.includes(q))
      .map((e) => ({ $key: e.$key, $el: e.$el, date: e.date, title: title(e.body) }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  },
});

const doc = dom.window.document;
doc.body.innerHTML = markup;
const root = doc.querySelector("[sap]");
const rows = () => doc.querySelectorAll("#list > a.row");

const t0 = performance.now();
Sap.mount(root);
const mountMs = performance.now() - t0;

async function time(label, fn, runs = 15) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    await new Promise((r) => setTimeout(r, 0));
    fn(i);
    const s = performance.now();
    Sap.refresh();
    samples.push(performance.now() - s);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  console.log(`${label.padEnd(28)} median ${median.toFixed(1)} ms   p95 ${p95.toFixed(1)} ms`);
}

console.log(`records ${N}   rows ${rows().length}   mount ${mountMs.toFixed(1)} ms   mountWrites ${Sap.status().apps[0].mountWrites}`);

await time("idle pass", () => {});

const firstRowNodes = new Set(rows());
let observed = 0;
const mo = new dom.window.MutationObserver((recs) => { observed += recs.length; });
mo.observe(doc.querySelector("#list"), { childList: true, subtree: true, attributes: true, characterData: true });

await time("one body edit", (i) => {
  const ta = doc.querySelector('[data-id="e5"] textarea');
  ta.value = `# Entry 5 edit ${i}\n${BODY}`;
});
await new Promise((r) => setTimeout(r, 0));
const editMutations = observed;
observed = 0;

await time("one date change (reorder)", (i) => {
  doc.querySelector('[data-id="e7"]').setAttribute("data-date", `2026-01-${String(1 + (i % 28)).padStart(2, "0")}`);
});

await time("search filter", (i) => {
  const q = doc.querySelector("#q");
  q.value = i % 2 ? "Entry 1" : "";
  q.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});

const retained = [...rows()].filter((r) => firstRowNodes.has(r)).length;
console.log(`after search toggles: rows ${rows().length}, retained from first render ${retained}`);
console.log(`DOM mutations inside #list across 15 body edits: ${editMutations} (expect about 15, one text change each)`);
mo.disconnect();
