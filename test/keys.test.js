import { mount, Sap } from "./helpers/mount.js";

const ENTRIES = `
  <main sap state="selected">
    <section items="entries">
      <article item template data-id=""><span bind="title"></span></article>
      <article item data-id="welcm1" set:selected="item.$key"><span bind="title">Welcome</span></article>
      <article item data-id="b2" set:selected="item.$key"><span bind="title">Second</span></article>
    </section>
    <output text="state.entries.map(e => e.$key).join(',')"></output>
    <aside detail="entries by state.selected"><span bind="title" id="dt"></span></aside>
    <button id="add" trigger-add="entries">add</button>
  </main>`;

describe("row keys", () => {
  test("rows keyed by data-id get no id attribute at mount", () => {
    const root = mount(ENTRIES);
    const rows = root.querySelectorAll("article[item]:not([template])");
    expect([...rows].map((r) => r.hasAttribute("id"))).toEqual([false, false]);
    expect(root.querySelector("output").textContent).toBe("welcm1,b2");
  });

  test("mount writes nothing when every row has data-id", () => {
    mount(ENTRIES.replace("></output>", ">welcm1,b2</output>"));
    expect(Sap.status().apps[0].mountWrites).toBe(0);
  });

  test("detail selects by data-id key", async () => {
    const root = mount(ENTRIES);
    root.querySelector('[data-id="b2"]').click();
    await flush();
    expect(root.querySelector("#dt").textContent).toBe("Second");
  });

  test("a row with neither data-id nor id keeps a stable runtime key and gets no attribute", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs"><li item template><span bind="n"></span></li><li item><span bind="n">1</span></li></ul>
        <output text="state.xs[0].$key"></output>
      </main>`);
    const first = root.querySelector("output").textContent;
    Sap.refresh();
    await flush();
    expect(root.querySelector("output").textContent).toBe(first);
    expect(root.querySelector("li[item]:not([template])").hasAttribute("id")).toBe(false);
  });

  test("adding a row from a data-id template mints a unique data-id and no id", async () => {
    const root = mount(ENTRIES);
    root.querySelector("#add").click();
    await flush();
    const rows = [...root.querySelectorAll("article[item]:not([template])")];
    expect(rows.length).toBe(3);
    const added = rows[2];
    expect(added.hasAttribute("id")).toBe(false);
    expect(added.getAttribute("data-id")).toMatch(/^row-[a-z0-9]+$/);
    expect(new Set(rows.map((r) => r.getAttribute("data-id"))).size).toBe(3);
  });

  test("adding a row from an id-less template still stamps a fresh unique id", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs"><li item template><span bind="n"></span></li><li item id="row-keep"><span bind="n">1</span></li></ul>
        <button id="add" trigger-add="xs">add</button>
      </main>`);
    root.querySelector("#add").click();
    await flush();
    const ids = [...root.querySelectorAll("li[item]:not([template])")].map((r) => r.id);
    expect(ids[0]).toBe("row-keep");
    expect(ids[1]).toMatch(/^row-[a-z0-9]+$/);
    expect(ids[1]).not.toBe("row-keep");
  });
});
