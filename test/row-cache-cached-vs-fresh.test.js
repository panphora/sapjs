import { mount, Sap } from "./helpers/mount.js";
import { runPass } from "../src/pass.js";
import { settle } from "./helpers/intake-sequences.js";

afterEach(() => {
  Sap._reset();
  for (const k of ["ro", "getter"]) delete Sap.formats[k];
});

async function fixture(html) {
  const root = mount(html);
  await settle();
  return { root, app: Sap._registry.get(root) };
}

// Run the same steps with cached passes and with cacheReads:false passes.
async function both(html, steps, read) {
  const out = {};
  for (const [label, opts] of [["cached", {}], ["fresh", { cacheReads: false }]]) {
    const { root, app } = await fixture(html);
    const seen = [];
    for (const step of steps) {
      step(root, app);
      runPass(app, opts);
      seen.push(read(root, app));
    }
    out[label] = seen;
    Sap._reset();
  }
  return out;
}

test("S1 calc: in a detail panel leaves its value on a previously opened kept row", async () => {
  const html = `<main sap state="open=a">` +
    `<section items="entries">` +
    `<article item data-id="a" state="data-n:num" data-n="1"><b text="item.isopen ? 'OPEN' : '-'">-</b></article>` +
    `<article item data-id="b" state="data-n:num" data-n="2"><b text="item.isopen ? 'OPEN' : '-'">-</b></article>` +
    `</section>` +
    `<aside detail="entries by state.open" calc:isOpen="true"><span text="item.n"></span></aside></main>`;
  const r = await both(html, [
    () => {},
    (root) => root.setAttribute("open", "b"),
    () => {},
  ], (root, app) => ({ flags: [...root.querySelectorAll("b")].map((b) => b.textContent), keys: app._state.entries.map((e) => Object.keys(e).join(",")) }));
  expect(r.cached).toEqual(r.fresh);
});

test("S2 nested detail state= inside a detail panel reads a stale value on a kept row", async () => {
  const html = `<main sap state="open=a">` +
    `<section items="entries"><article item data-id="a" state="data-t" data-t="A"></article></section>` +
    `<aside detail="entries by state.open"><div id="inner" detail="entries by root.open" state="tab=notes"><i id="t" text="item.tab"></i></div></aside></main>`;
  const r = await both(html, [
    () => {},
    (root) => root.querySelector("#inner").setAttribute("tab", "photos"),
    () => {},
  ], (root) => root.querySelector("#t").textContent);
  expect(r.cached).toEqual(r.fresh);
});

test("S3 a format that makes a declared field read-only does not break later passes", async () => {
  Sap.formats.ro = (rows) => rows.map((r) => { Object.defineProperty(r, "t", { value: r.t, writable: false }); return r.t; }).join(",");
  const html = `<main sap><section items="entries"><article item data-id="a" state="data-t" data-t="A"></article></section><output id="o" text="fmt.ro(state.entries)"></output></main>`;
  const { root, app } = await fixture(html);
  expect(() => runPass(app, {})).not.toThrow();
  expect(() => runPass(app, {})).not.toThrow();
  expect(root.querySelector("#o").textContent).toBe("A");
});

test("S4 default materialized when a visibility verb appears elsewhere later", async () => {
  const html = `<main sap><section items="entries"><article item data-id="a" state="status=todo"><i>x</i></article></section><p id="p"></p></main>`;
  const r = await both(html, [
    () => {},
    (root) => root.querySelector("#p").setAttribute("show-when:status", "todo"),
    () => {},
  ], (root) => root.querySelector("article").getAttribute("status"));
  expect(r.cached).toEqual(r.fresh);
});

test("S5 textContent replacement of a bound leaf", async () => {
  const html = `<main sap><section items="entries"><article item data-id="a"><code bind="body">A</code></article></section><output id="o" text="state.entries.map(e => e.body).join()"></output></main>`;
  const r = await both(html, [
    () => {},
    (root) => { root.querySelector("code").textContent = "B"; },
    (root) => { root.querySelector("code").innerHTML = "<b>C</b>"; },
    (root) => { root.querySelector("code b").firstChild.data = "D"; },
  ], (root) => root.querySelector("#o").textContent);
  expect(r.cached).toEqual(r.fresh);
});

test("S6 detached edit then reinsert of a row", async () => {
  const html = `<main sap><section id="l" items="entries"><article item data-id="a" state="data-t" data-t="A"></article><article item data-id="b" state="data-t" data-t="B"></article></section><output id="o" text="state.entries.map(e => e.t + e.$index).join()"></output></main>`;
  const { root, app } = await fixture(html);
  runPass(app, {});
  const a = root.querySelector('[data-id="a"]');
  a.remove();
  runPass(app, {});
  await settle();
  a.setAttribute("data-t", "A2");
  root.querySelector("#l").append(a);
  runPass(app, {});
  expect(root.querySelector("#o").textContent).toBe("B0,A21");
});

test("S7 row moved between two lists keeps no stale meta", async () => {
  const html = `<main sap><section id="l1" items="one"><article item data-id="a" state="data-t" data-t="A"></article></section><section id="l2" items="two"><article item data-id="b" state="data-t" data-t="B"></article></section><output id="o" text="state.one.map(e=>e.$key+e.$index).join() + '|' + state.two.map(e=>e.$key+e.$index).join()"></output></main>`;
  const { root, app } = await fixture(html);
  runPass(app, {});
  const a = root.querySelector('[data-id="a"]');
  const objA = app._state.one[0];
  root.querySelector("#l2").prepend(a);
  runPass(app, {});
  expect(root.querySelector("#o").textContent).toBe("|a0,b1");
  expect(app._state.two[0]).not.toBe(objA);
});

test("S8 list item attribute rename (items= name change) keeps rows", async () => {
  const html = `<main sap><section id="l" items="one"><article item data-id="a" state="data-t" data-t="A"></article></section><output id="o" text="(state.two || []).map(e=>e.t).join()"></output></main>`;
  const r = await both(html, [
    () => {},
    (root) => root.querySelector("#l").setAttribute("items", "two"),
  ], (root) => root.querySelector("#o").textContent);
  expect(r.cached).toEqual(r.fresh);
});

test("S9 a presence field shadowed by a same-name bind leaf", async () => {
  const html = `<main sap><section items="entries"><article item data-id="a" state="data-done:presence"><span bind="done">yes</span></article></section><output id="o" text="state.entries.map(e => String(e.done)).join()"></output></main>`;
  const r = await both(html, [() => {}, () => {}, () => {}], (root) => root.querySelector("#o").textContent);
  expect(r.cached).toEqual(r.fresh);
});

test("S10 a format that deletes a declared field changes key order on a kept row", async () => {
  Sap.formats.getter = (rows) => rows.map((r) => { const d = r.d; delete r.d; r.d = d; return Object.keys(r).join("+"); }).join(",");
  const html = `<main sap><section items="entries"><article item data-id="a" state="data-d data-e" data-d="1" data-e="2"></article></section><output id="o" text="fmt.getter(state.entries)"></output><output id="k" text="state.entries.map(r => Object.keys(r).join('+')).join()"></output></main>`;
  const r = await both(html, [() => {}, () => {}], (root, app) => Object.keys(app._state.entries[0]).join("+"));
});
