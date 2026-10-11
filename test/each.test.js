import { mount, type, Sap } from "./helpers/mount.js";

const LIST = `
  <main sap state="open:transient">
    <section items="entries">
      <article item template data-id="" state="data-date"><input bind="title"></article>
      <article item data-id="a1" state="data-date" data-date="2026-10-01"><input bind="title" value="Alpha"></article>
      <article item data-id="b2" state="data-date" data-date="2026-10-03"><input bind="title" value="Beta"></article>
      <article item data-id="c3" state="data-date" data-date="2026-10-02"><input bind="title" value="Gamma"></article>
    </section>
    <nav id="list" each="state.entries.filter(e => !state.q || e.title.includes(state.q)).slice().sort((a, b) => b.date.localeCompare(a.date))">
      <template><a class="row" set:open="item.$key" class:on="state.open === item.$key"><span text="item.title"></span><button trigger-remove>x</button></a></template>
    </nav>
    <input id="q" bind="q" transient>
  </main>`;

const rows = (root) => [...root.querySelectorAll("#list > a.row")];
const titles = (root) => rows(root).map((r) => r.querySelector("span").textContent);
const rowFor = (root, key) => root.querySelector(`#list > [data-key="${key}"]`);
const codes = () => Sap.report().errors.map((e) => e.code);

describe("each", () => {
  test("renders one editor-ui row per item in the expression's order", () => {
    const root = mount(LIST);
    expect(titles(root)).toEqual(["Beta", "Gamma", "Alpha"]);
    const first = rows(root)[0];
    expect(first.getAttribute("clay")).toBe("editor-ui");
    expect(first.getAttribute("data-key")).toBe("b2");
    expect(first.hasAttribute("id") || first.hasAttribute("data-id")).toBe(false);
    expect(root.querySelector("#list > template")).not.toBeNull();
  });

  test("rows keep their identity through a reorder and a filter", async () => {
    const root = mount(LIST);
    const gamma = rowFor(root, "c3");
    Sap(root.querySelector('[data-id="c3"]')).date = "2026-10-09";
    await flush();
    expect(titles(root)).toEqual(["Gamma", "Beta", "Alpha"]);
    expect(rowFor(root, "c3")).toBe(gamma);
    type(root.querySelector("#q"), "mm");
    await flush();
    expect(rows(root)).toEqual([gamma]);
  });

  test("a source edit repaints its row in place", async () => {
    const root = mount(LIST);
    const alpha = rowFor(root, "a1");
    type(root.querySelector('[data-id="a1"] input'), "Alpha 2");
    await flush();
    expect(rowFor(root, "a1")).toBe(alpha);
    expect(alpha.querySelector("span").textContent).toBe("Alpha 2");
  });

  test("adding and removing records adds and removes rows", async () => {
    const root = mount(LIST);
    Sap(root.querySelector('[data-id="a1"]')).$remove();
    await flush();
    expect(titles(root)).toEqual(["Beta", "Gamma"]);
    Sap(root).$add("entries");
    await flush();
    expect(rows(root).length).toBe(3);
  });

  test("set: inside a row sees the row's item", async () => {
    const root = mount(LIST);
    rowFor(root, "b2").click();
    await flush();
    expect(rows(root).filter((r) => r.classList.contains("on")).map((r) => r.dataset.key)).toEqual(["b2"]);
  });

  test("trigger-remove inside a row removes the source record", async () => {
    const root = mount(LIST);
    rowFor(root, "b2").querySelector("button").click();
    await flush();
    expect(root.querySelector('[data-id="b2"]')).toBeNull();
    expect(rowFor(root, "b2")).toBeNull();
    expect(titles(root)).toEqual(["Gamma", "Alpha"]);
  });

  test("nested each regroups when a record changes group", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template state="data-g"><span bind="n"></span></li>
          <li item data-id="x1" state="data-g" data-g="A"><span bind="n">one</span></li>
          <li item data-id="x2" state="data-g" data-g="B"><span bind="n">two</span></li>
        </ul>
        <div id="groups" each="['A', 'B'].map(g => ({ key: g, rows: state.xs.filter(x => x.g === g) }))" key="item.key">
          <template><section><h2 text="item.key"></h2><div class="inner" each="item.rows"><template><p text="item.n"></p></template></div></section></template>
        </div>
      </main>`);
    const groupText = (k) => [...root.querySelectorAll(`#groups > [data-key="${k}"] .inner > p`)].map((p) => p.textContent);
    expect(groupText("A")).toEqual(["one"]);
    expect(groupText("B")).toEqual(["two"]);
    Sap(root.querySelector('[data-id="x1"]')).g = "B";
    await flush();
    expect(groupText("A")).toEqual([]);
    expect(groupText("B")).toEqual(["one", "two"]);
  });

  test("a duplicate key reports E41 and keeps the last good rows", async () => {
    const root = mount(`
      <main sap state="dup:bool">
        <ul each="state.dup ? [{ k: 1 }, { k: 1 }] : [{ k: 1 }, { k: 2 }]" key="item.k"><template><li text="item.k"></li></template></ul>
      </main>`);
    expect(root.querySelectorAll("ul > li").length).toBe(2);
    Sap(root).dup = true;
    await flush();
    expect(codes()).toContain("E41");
    expect(root.querySelectorAll("ul > li").length).toBe(2);
  });

  test("a non-array is E40, a missing template is E42, bind in a row is E43", () => {
    mount(`<main sap><ul each="5" key="item"><template><li></li></template></ul></main>`);
    expect(codes()).toContain("E40");
    mount(`<main sap><ul each="[1]" key="item"></ul></main>`);
    expect(codes()).toContain("E42");
    mount(`<main sap><ul each="[{ k: 1 }]" key="item.k"><template><li><input bind="x"></li></template></ul></main>`);
    expect(codes()).toContain("E43");
  });

  test("rows do not count as mount writes", () => {
    mount(LIST);
    expect(Sap.status().apps[0].mountWrites).toBe(0);
  });

  test("sap:views-updated fires after a pass that changed rows, not after an idle one", async () => {
    const root = mount(LIST);
    let fired = 0;
    root.addEventListener("sap:views-updated", () => fired++);
    Sap.refresh();
    await flush();
    expect(fired).toBe(0);
    type(root.querySelector('[data-id="a1"] input'), "Alpha 3");
    await flush();
    expect(fired).toBe(1);
  });
});
