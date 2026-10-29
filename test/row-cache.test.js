import { mount, Sap } from "./helpers/mount.js";
import { runPass } from "../src/pass.js";
import { registerFeature } from "../src/pass.js";
import { settle } from "./helpers/intake-sequences.js";

const row = (id, date, body) =>
  `<article item data-id="${id}" state="data-date data-pinned" data-date="${date}"><code bind="body">${body}</code></article>`;

function journal(extra = "") {
  return `<main sap state="prefix=Day"><input id="q" bind="q" value="">${extra}<section id="entries" items="entries">${row("a", "2025-01-01", "Alpha")}${row("b", "2025-01-02", "Beta")}${row("c", "2025-01-03", "Gamma")}</section></main>`;
}

async function fixture(html = journal()) {
  const root = mount(html);
  await settle();
  return { root, app: Sap._registry.get(root) };
}

afterEach(() => {
  Sap._reset();
  for (const k of ["split", "wrap"]) delete Sap.formats[k];
});

test("an unchanged row keeps its object across passes; an edited row gets a new one", async () => {
  const { root, app } = await fixture();
  const before = app._state.entries.slice();
  root.querySelector('[data-id="b"] code').firstChild.data = "Beta edited";
  runPass(app, {});
  const after = app._state.entries;
  expect(after[0]).toBe(before[0]);
  expect(after[2]).toBe(before[2]);
  expect(after[1]).not.toBe(before[1]);
  expect(after[1].body).toBe("Beta edited");
});

test("a reused row keeps its $ fields own and hidden, and its $index follows an insert", async () => {
  const { root, app } = await fixture();
  const gamma = app._state.entries[2];
  root.querySelector("#entries").insertAdjacentHTML("afterbegin", row("z", "2024-12-31", "Zero"));
  runPass(app, {});
  const now = app._state.entries[3];
  expect(now).toBe(gamma);
  expect(now.$index).toBe(3);
  expect(now.$key).toBe("c");
  expect(now.$el).toBe(root.querySelector('[data-id="c"]'));
  expect(["$key", "$index", "$el"].map((k) => Object.hasOwn(now, k))).toEqual([true, true, true]);
  expect(Object.keys(now)).toEqual(["date", "pinned", "body"]);
  expect(JSON.stringify(now)).toBe('{"date":"2025-01-03","pinned":"","body":"Gamma"}');
  expect({ ...now }).toEqual({ date: "2025-01-03", pinned: "", body: "Gamma" });
});

test("a format that rewrites a field of a reused row does not change the next pass", async () => {
  Sap.formats.split = (rows) => rows.map((r) => {
    r.date = r.date.split("-");
    return r.date.length;
  }).join(",");
  const { root, app } = await fixture(journal(`<output id="o" text="fmt.split(state.entries)"></output>`));
  runPass(app, {});
  runPass(app, {});
  expect(root.querySelector("#o").textContent).toBe("3,3,3");
  expect(app.diag.errors).toEqual([]);
});

test("a descendant's directive edit re-reads the row through it", async () => {
  const { root, app } = await fixture();
  root.querySelector('[data-id="a"] code').setAttribute("bind", "text");
  runPass(app, {});
  expect(app._state.entries[0]).toMatchObject({ text: "Alpha" });
  expect("body" in app._state.entries[0]).toBe(false);
});

test("a paint inside a reused row still follows state outside the row", async () => {
  const html = `<main sap state="prefix=Day"><section id="entries" items="entries">` +
    `<article item data-id="a" state="data-date" data-date="1"><b text="state.prefix + ' ' + item.date">Day 1</b></article>` +
    `</section></main>`;
  const { root, app } = await fixture(html);
  const first = app._state.entries[0];
  root.setAttribute("prefix", "Week");
  runPass(app, {});
  expect(app._state.entries[0]).toBe(first);
  expect(root.querySelector("b").textContent).toBe("Week 1");
});

test("rows that hold live controls, transient fields, nested lists or calcs are read fresh", async () => {
  const html = `<main sap><section items="rows">` +
    `<div item data-id="c"><input bind="title" value="x"></div>` +
    `<div item data-id="t" state="mark:transient"></div>` +
    `<div item data-id="n"><ul items="subs"><li item data-id="s"><span bind="v">1</span></li></ul></div>` +
    `<div item data-id="k" state="data-n:num" data-n="2" calc:double="item.n * 2"></div>` +
    `</section></main>`;
  const { root, app } = await fixture(html);
  const before = app._state.rows.slice();
  root.querySelector("input").value = "typed";
  Sap(root.querySelector('[data-id="t"]')).mark = "on";
  await settle();
  const after = app._state.rows;
  for (let i = 0; i < 4; i++) expect(after[i]).not.toBe(before[i]);
  expect(after[0].title).toBe("typed");
  expect(after[1].mark).toBe("on");
  expect(after[3].double).toBe(4);
});

test("a full pass gives every row a new object", async () => {
  const { app } = await fixture();
  const before = app._state.entries.slice();
  Sap.refresh();
  app._state.entries.forEach((r, i) => expect(r).not.toBe(before[i]));
});

test("an app outside the observed document builds new rows every pass", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const root = document.createElement("main");
  root.setAttribute("sap", "");
  root.innerHTML = `<section items="entries">${row("a", "1", "A")}</section>`;
  shadow.append(root);
  Sap.mount(root);
  const app = Sap._registry.get(root);
  const first = app._state.entries[0];
  runPass(app, {});
  expect(app._state.entries[0]).not.toBe(first);
  host.remove();
});

test("a feature's diagnostic from a row is reported on every pass", async () => {
  registerFeature({
    name: "test-warn",
    collect(pass, el) {
      if (el.hasAttribute("data-warn")) pass.app.diag.error("E99", el, { problem: "test" });
    },
  });
  const { app } = await fixture(`<main sap><section items="entries"><article item data-id="a"><i data-warn></i></article></section></main>`);
  runPass(app, {});
  runPass(app, {});
  expect(app.diag.errors.map((e) => e.code)).toEqual(["E99"]);
});

test("a row holding an each= view is read fresh, so the view follows state", async () => {
  const html = `<main sap state="n:num=1"><section items="entries"><article item data-id="a"><ul each="[state.n]" key="item"><template><li text="item"></li></template></ul></article></section></main>`;
  const { root, app } = await fixture(html);
  runPass(app, {});
  root.setAttribute("n", "2");
  runPass(app, {});
  expect(root.querySelector("li").textContent).toBe("2");
});

test("a format that freezes the rows it reads does not break the next pass", async () => {
  Sap.formats.wrap = (rows) => rows.map((r) => Object.freeze(r).body).join(",");
  const { root, app } = await fixture(journal(`<output id="o" text="fmt.wrap(state.entries)"></output>`));
  root.querySelector("#entries").insertAdjacentHTML("afterbegin", row("z", "2024-12-31", "Zero"));
  runPass(app, {});
  runPass(app, {});
  expect(root.querySelector("#o").textContent).toBe("Zero,Alpha,Beta,Gamma");
  expect(app._state.entries[1].$index).toBe(1);
});

test("a steady pass asks no row whether it is a CMS seed", async () => {
  const { countReads } = await import("./helpers/intake-sequences.js");
  const { root, app } = await fixture();
  const reads = countReads();
  try {
    runPass(app, {});
    expect(reads.counts.hasAttrByName["cms-template"] || 0).toBe(0);
    root.querySelector('[data-id="a"]').setAttribute("cms-template", "");
    runPass(app, {});
    expect(app._state.entries.map((r) => r.$key)).toEqual(["b", "c"]);
  } finally {
    reads.restore();
  }
});

test("cached and uncached passes agree through insert, move, remove and edits", async () => {
  const { snapshot } = await import("./helpers/intake-sequences.js");
  const entry = (id, d, b) => `<article class="entry" item data-id="${id}" state="data-date data-pinned:presence" data-date="${d}"><code bind="body">${b}</code></article>`;
  const html = `<main sap><section id="entries" items="entries">${entry("a", "1", "A")}${entry("b", "2", "B")}${entry("c", "3", "C")}</section></main>`;
  const steps = [
    (r) => r.querySelector("#entries").insertAdjacentHTML("afterbegin", entry("z", "0", "Z")),
    (r) => r.querySelector("#entries").append(r.querySelector('[data-id="a"]')),
    (r) => r.querySelector('[data-id="b"]').setAttribute("data-pinned", ""),
    (r) => r.querySelector('[data-id="c"] code').firstChild.data = "C2",
    (r) => r.querySelector('[data-id="z"]').remove(),
    () => {},
  ];
  const run = async (opts) => {
    const { root, app } = await fixture(html);
    const out = [];
    for (const step of steps) {
      step(root);
      runPass(app, opts);
      out.push({ snap: snapshot(root, app), index: app._state.entries.map((r) => [r.$key, r.$index]) });
    }
    return out;
  };
  const cached = await run({});
  const uncached = await run({ cacheReads: false });
  expect(cached).toEqual(uncached);
});
