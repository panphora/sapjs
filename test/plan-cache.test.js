// The directive plan cache (src/plan.js) must never change what a pass does: every way
// the page can change an element's attributes reaches the next pass, whichever backend
// the mutation bridge runs on.

import { mount, Sap } from "./helpers/mount.js";

const tick = async (n = 4) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const macrotask = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  Sap._reset();
  delete window.hyperclay;
});

const markup = `<main sap><input id="i" bind="m" value="hi"><span id="out" text="state.m"></span></main>`;

function typeIn(root, value) {
  const input = root.querySelector("#i");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// A hub that reports nothing. Passes then come only from Sap's own delegated events,
// which is what a region the hub filters out (no-watch, mutations-ignore, editor-ui) gets.
function installSilentHub() {
  window.hyperclay = { Mutation: { onAnyChange: () => () => {}, pause() {}, resume() {} } };
}

test("native: a directive edited in the same task as an input event", async () => {
  const root = mount(markup);
  await tick();
  typeIn(root, "yo");
  root.querySelector("#out").setAttribute("text", "state.m + '!'");
  await tick();
  expect(root.querySelector("#out").textContent).toBe("yo!");
  typeIn(root, "ok");
  await tick();
  expect(root.querySelector("#out").textContent).toBe("ok!");
});

test("hub that never reports the edit: the next pass still reads the new directive", async () => {
  installSilentHub();
  const root = mount(markup);
  await tick();
  typeIn(root, "yo");
  root.querySelector("#out").setAttribute("text", "state.m + '!'");
  await tick();
  expect(root.querySelector("#out").textContent).toBe("yo!");
  root.querySelector("#out").setAttribute("text", "state.m + '?'");
  await macrotask();
  typeIn(root, "ok");
  await tick();
  expect(root.querySelector("#out").textContent).toBe("ok?");
});

test("an element edited while detached is read fresh when it comes back", async () => {
  const root = mount(`<main sap state="n:num=1"><section id="piece"><output text="state.n">1</output></section></main>`);
  await macrotask();
  const piece = root.querySelector("#piece");
  piece.remove();
  await macrotask();
  piece.firstElementChild.setAttribute("text", "state.n + 10");
  root.append(piece);
  await macrotask();
  expect(piece.firstElementChild.textContent).toBe("11");
});

test("a control's kind is read when it is used, after a paint earlier in the pass changed it", async () => {
  const root = mount(`<main sap state="selected=a"><ul items="rows"><li item data-id="a"><select multiple bind="choices"><option value="x" selected>X</option><option value="y" selected>Y</option></select></li></ul><aside detail="rows by state.selected"><select id="projection" bind="choices" attr:multiple="true"><option value="x">X</option><option value="y">Y</option></select></aside></main>`);
  await macrotask();
  const select = root.querySelector("#projection");
  expect(select.multiple).toBe(true);
  expect([...select.selectedOptions].map((o) => o.value)).toEqual(["x", "y"]);
});

test("a row's $ fields stay its own properties, so a format may wrap rows in a Proxy", async () => {
  Sap.formats.wrap = (rows) => rows.map((row) => new Proxy(row, {}));
  try {
    const root = mount(`<main sap><ul items="rows"><li item data-id="a"><span bind="title">Alpha</span></li></ul><nav each="fmt.wrap(state.rows)"><template><a text="item.title"></a></template></nav><output id="own" text="Object.hasOwn(state.rows[0], '$key')"></output></main>`);
    await macrotask();
    expect([...root.querySelectorAll("nav > a")].map((a) => a.textContent)).toEqual(["Alpha"]);
    expect(root.querySelector("#own").textContent).toBe("true");
  } finally {
    delete Sap.formats.wrap;
  }
});

test("an app outside the observed document (a shadow root) reads its directives fresh", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const root = document.createElement("main");
  root.setAttribute("sap", "");
  root.setAttribute("state", "n:num=1");
  root.innerHTML = '<output text="state.n">1</output>';
  shadow.append(root);
  Sap.mount(root);
  await macrotask();
  root.querySelector("output").setAttribute("text", "state.n + 10");
  Sap(root).n = 2;
  await macrotask();
  expect(root.querySelector("output").textContent).toBe("12");
  host.remove();
});

test("a row whose connectedCallback edits its directives while the pass places it", async () => {
  if (!customElements.get("x-plan-row")) {
    customElements.define("x-plan-row", class extends HTMLElement {
      connectedCallback() {
        this.connections = (this.connections || 0) + 1;
        if (this.connections > 1) this.setAttribute("text", "'Moved ' + item.title");
      }
    });
  }
  const root = mount(`<main sap state="n:num=0"><ul items="rows"><li item data-id="a"><span bind="title">Alpha</span></li><li item data-id="b"><span bind="title">Beta</span></li></ul><nav each="state.rows"><template><x-plan-row text="item.title"></x-plan-row></template></nav></main>`);
  await macrotask();
  Sap(root).n = 1;
  await macrotask();
  const ul = root.querySelector("ul");
  ul.append(ul.firstElementChild);
  await macrotask();
  const moved = [...root.querySelectorAll("nav > x-plan-row")].filter((el) => el.connections > 1);
  expect(moved.length).toBeGreaterThan(0);
  for (const el of moved) expect(el.textContent.startsWith("Moved ")).toBe(true);
});

test("a plain element shares the empty plan until it gains a directive", async () => {
  const root = mount(`<main sap><input id="i" bind="m" value="hi"><p id="a"></p><p id="b"></p></main>`);
  await tick();
  typeIn(root, "yo");
  await tick();
  const a = root.querySelector("#a");
  const b = root.querySelector("#b");
  expect(a._sapPlan).toBeTruthy();
  expect(a._sapPlan).toBe(b._sapPlan);
  expect(Object.isFrozen(a._sapPlan)).toBe(true);
  a.setAttribute("text", "state.m");
  typeIn(root, "ok");
  await tick();
  expect(a.textContent).toBe("ok");
  expect(b.textContent).toBe("");
  expect(a._sapPlan).not.toBe(b._sapPlan);
});
