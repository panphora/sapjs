// Record-shaped intake fixtures and mutation sequences, shared by
// scripts/measure-intake.mjs and test/intake-oracle.test.js. Both run against
// whatever DOM realm the caller installed (jest's jsdom or the script's JSDOM), so
// this module reads globals lazily and imports nothing from src/.

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(3);

export const PAGE_SIZE = 20;

const DECLS = "data-date data-created data-updated data-words data-tags data-pinned:presence";

// mulberry32: the same seed always builds the same fixture and picks the same rows.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateOf(i, seed) {
  const day = String(1 + ((i * 7 + seed) % 28)).padStart(2, "0");
  const month = String(1 + ((i + seed) % 12)).padStart(2, "0");
  return `2025-${month}-${day}`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function entryBody(i, seed = 1) {
  return `# Entry ${i}\n\n${LOREM}Row ${i} of seed ${seed}.\n`;
}

export function entryMarkup(i, seed = 1) {
  const date = dateOf(i, seed);
  const pinned = (i + seed) % 5 === 0 ? " data-pinned" : "";
  const body = escapeHtml(entryBody(i, seed));
  return (
    `<article class="entry" item data-id="e${seed}-${i}" state="${DECLS}"` +
    ` data-date="${date}" data-created="${date}T09:00:00" data-updated="${date}T10:30:00"` +
    ` data-words="${40 + (i % 400)}" data-tags="tag${i % 7} tag${i % 11}"${pinned}>` +
    `<pre class="entry-source"><code class="entry-body" bind="body">${body}</code></pre></article>`
  );
}

export function rowsMarkup(count, seed = 1) {
  let out = "";
  for (let i = 0; i < count; i++) out += entryMarkup(i, seed);
  return out;
}

// Seven fields per record (six declared attributes, one of them presence, plus the
// bind= body carrier) and a paged each= projection of the record set.
export function buildMarkup(count, seed = 1) {
  return (
    `<main sap state="q:transient">` +
    `<input id="q" type="search" bind="q" transient placeholder="Search">` +
    `<input id="page" type="number" bind="page" value="0">` +
    `<nav id="list" each="fmt.page(state.entries, state.page)"><template>` +
    `<a class="row"><b class="row-date" text="item.date"></b>` +
    `<span class="row-tags" text="item.tags"></span><i class="row-words" text="item.words"></i></a>` +
    `</template></nav>` +
    `<section id="entries" items="entries">${rowsMarkup(count, seed)}</section>` +
    `</main>`
  );
}

export const pageFormat = (rows, page) => {
  const p = Number(page) || 0;
  return Array.isArray(rows) ? rows.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE) : [];
};

export const SEQUENCES = [
  {
    name: "journal",
    steps: [
      {
        name: "body edit",
        apply({ root, seed }) {
          const rows = root.querySelectorAll("#entries > article.entry");
          const i = Math.floor(seeded(seed + 101)() * rows.length);
          const body = rows[i].querySelector(".entry-body");
          body.firstChild.data = entryBody(i, seed).replace("Row", "Edited row") + "A line the page typed.\n";
        },
      },
      {
        name: "control edit",
        apply({ root }) {
          const q = root.querySelector("#q");
          const Event = root.ownerDocument.defaultView.Event;
          q.value = "entry 1";
          q.dispatchEvent(new Event("input", { bubbles: true }));
          q.dispatchEvent(new Event("change", { bubbles: true }));
        },
      },
      {
        name: "structural replacement",
        apply({ root, count, seed }) {
          const list = root.querySelector("#entries");
          const next = root.ownerDocument.createElement("section");
          next.id = "entries";
          next.setAttribute("items", "entries");
          next.innerHTML = rowsMarkup(count, seed + 1);
          list.replaceWith(next);
        },
      },
    ],
  },
];

// Count canonical DOM reads without touching src/: wrap the element attribute
// readers and the textContent getter for the measured window, then put back exactly
// what was there. Reads on the record's .entry-body carrier are counted apart from
// the rest so a table can separate record work from view/paint comparisons.
export function countReads(target = globalThis) {
  const ElementProto = target.Element.prototype;
  const NodeProto = target.Node.prototype;
  const counts = { attr: 0, hasAttr: 0, text: 0, recordText: 0, attrByName: {}, hasAttrByName: {} };
  const undo = [];
  for (const name of ["getAttribute", "hasAttribute"]) {
    const original = ElementProto[name];
    Object.defineProperty(ElementProto, name, {
      configurable: true,
      writable: true,
      value: function (...args) {
        if (name === "getAttribute") {
          counts.attr++;
          counts.attrByName[args[0]] = (counts.attrByName[args[0]] || 0) + 1;
        } else {
          counts.hasAttr++;
          counts.hasAttrByName[args[0]] = (counts.hasAttrByName[args[0]] || 0) + 1;
        }
        return original.apply(this, args);
      },
    });
    undo.push(() => Object.defineProperty(ElementProto, name, { configurable: true, writable: true, value: original }));
  }
  const desc = Object.getOwnPropertyDescriptor(NodeProto, "textContent");
  Object.defineProperty(ElementProto, "textContent", {
    configurable: true,
    get() {
      counts.text++;
      if (this.classList && this.classList.contains("entry-body")) counts.recordText++;
      return desc.get.call(this);
    },
    set(v) {
      desc.set.call(this, v);
    },
  });
  undo.push(() => {
    delete ElementProto.textContent;
  });
  return {
    counts,
    reset() {
      counts.attr = 0;
      counts.hasAttr = 0;
      counts.text = 0;
      counts.recordText = 0;
      counts.attrByName = {};
      counts.hasAttrByName = {};
    },
    restore() {
      while (undo.length) undo.pop()();
    },
  };
}

// Passes are counted from the engine's own per-pass debug header, so nothing in
// src/ has to expose a counter.
const PASS_LINE = "sap pass \u00b7";

export function probePasses() {
  const original = console.log;
  let count = 0;
  console.log = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith(PASS_LINE)) {
      count++;
      return;
    }
    original.apply(console, args);
  };
  return {
    count: () => count,
    reset() {
      count = 0;
    },
    restore() {
      console.log = original;
    },
  };
}

// Two macrotasks: the mutation observer delivers its records in a microtask and the
// pass it schedules runs in the next one.
export function settle() {
  return new Promise((resolve) => setTimeout(() => setTimeout(resolve, 0), 0));
}

function plain(value, seen = new Set()) {
  if (value == null || typeof value !== "object") return typeof value === "function" ? "[fn]" : value;
  if (value.nodeType === 1) {
    const tag = value.tagName.toLowerCase();
    const id = value.id ? `#${value.id}` : "";
    const dataId = value.getAttribute("data-id");
    return `[el ${tag}${id}${dataId ? `[data-id=${dataId}]` : ""}]`;
  }
  if (value.nodeType) return `[node ${value.nodeType}]`;
  if (Array.isArray(value)) return value.map((v) => plain(v, seen));
  if (seen.has(value)) return "[cycle]";
  seen.add(value);
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = plain(value[k], seen);
  return out;
}

function rowMeta(obj) {
  if (!obj) return null;
  return {
    own: ["$key", "$index", "$el"].filter((k) => Object.getOwnPropertyNames(obj).includes(k)),
    key: obj.$key,
    index: obj.$index,
  };
}

// The comparable shape of an app after a step: rendered DOM, public state without DOM
// identity, row metadata, and diagnostics.
export function snapshot(root, app) {
  const rows = [...root.querySelectorAll("#entries > article.entry")];
  return {
    html: root.innerHTML,
    attrs: [...root.attributes].map((a) => `${a.name}=${a.value}`),
    state: plain(root._sapScope),
    rows: rows.map((el) => ({ key: el.getAttribute("data-id"), meta: rowMeta(el._sapScope), state: plain(el._sapScope) })),
    errors: app ? plain(app.diag.errors) : null,
  };
}
