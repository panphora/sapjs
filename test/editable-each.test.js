import { mount, type, Sap } from "./helpers/mount.js";

const BOARD = `
  <main sap state="sel q">
    <section items="cards" hidden>
      <article item template data-id="" state="data-done:presence"><input bind="title"></article>
      <article item data-id="c1" state="data-done:presence"><input bind="title" value="Alpha"></article>
      <article item data-id="c2" state="data-done:presence" data-done><input bind="title" value="Beta"></article>
    </section>
    <ul id="v" each="state.cards">
      <template><li><input class="t" bind="title"><input class="d" type="checkbox" bind="done"><input class="q" bind="q"><button class="pick" set:sel="item.$key">pick</button><button class="ren" set:title="'Renamed'">ren</button></li></template>
    </ul>
    <output id="o" text="state.cards.map(c => c.title + (c.done ? '!' : '')).join(',')"></output>
  </main>`;

const row = (root, key) => root.querySelector(`#v > [data-key="${key}"]`);
const codes = () => Sap.report().errors.map((e) => e.code);

describe("editable each rows", () => {
  test("a record-owned bind paints from the record and writes through to it", async () => {
    const root = mount(BOARD);
    expect(row(root, "c1").querySelector(".t").value).toBe("Alpha");
    expect(row(root, "c2").querySelector(".d").checked).toBe(true);
    type(row(root, "c1").querySelector(".t"), "Alpha 2");
    await flush();
    expect(root.querySelector('[data-id="c1"] input').value).toBe("Alpha 2");
    expect(root.querySelector("#o").textContent).toBe("Alpha 2,Beta!");
    expect(codes()).not.toContain("E43");
  });

  test("a record-owned presence field written from a row checkbox adds and removes the attribute", async () => {
    const root = mount(BOARD);
    type(row(root, "c1").querySelector(".d"), true);
    type(row(root, "c2").querySelector(".d"), false);
    await flush();
    expect(root.querySelector('[data-id="c1"]').getAttribute("data-done")).toBe("");
    expect(root.querySelector('[data-id="c2"]').hasAttribute("data-done")).toBe(false);
    expect(root.querySelector("#o").textContent).toBe("Alpha!,Beta");
  });

  test("a field the record does not own resolves where the row is drawn", async () => {
    const root = mount(BOARD);
    type(row(root, "c1").querySelector(".q"), "hello");
    await flush();
    expect(Sap(root).q).toBe("hello");
    expect(root.querySelector('[data-id="c1"]').hasAttribute("q")).toBe(false);
    expect(row(root, "c2").querySelector(".q").value).toBe("hello");
  });

  test("set: follows the same rule for record rows", async () => {
    const root = mount(BOARD);
    row(root, "c2").querySelector(".pick").click();
    row(root, "c1").querySelector(".ren").click();
    await flush();
    expect(Sap(root).sel).toBe("c2");
    expect(root.querySelector('[data-id="c1"] input').value).toBe("Renamed");
  });

  test("set: in a row over plain objects writes where the row is drawn", async () => {
    const root = mount(`
      <main sap state="pick">
        <ul each="[{ k: 'a' }, { k: 'b' }]" key="item.k"><template><li><button set:pick="item.k">p</button></li></template></ul>
      </main>`);
    root.querySelectorAll("ul > li button")[1].click();
    await flush();
    expect(Sap(root).pick).toBe("b");
  });

  test("a bind that resolves nowhere is still E43", () => {
    mount(`<main sap><ul each="[{ k: 1 }]" key="item.k"><template><li><input bind="nowhere"></li></template></ul></main>`);
    expect(codes()).toContain("E43");
  });
});

describe("composer forms are never projections", () => {
  test("a composer draft inside a detail panel survives a pass", async () => {
    const root = mount(`
      <main sap state="selected">
        <section items="cards">
          <article item template data-id=""><span bind="title"></span><ul items="comments"><li item template data-id=""><span bind="text"></span></li></ul></article>
          <article item data-id="c1" set:selected="item.$key"><span bind="title">One</span><ul items="comments"><li item template data-id=""><span bind="text"></span></li></ul></article>
        </section>
        <aside detail="cards by state.selected">
          <input id="dt" bind="title">
          <form trigger-add="comments"><input id="draft" bind="text"></form>
        </aside>
      </main>`);
    root.querySelector('[data-id="c1"]').click();
    await flush();
    const draft = root.querySelector("#draft");
    type(draft, "half typed");
    await flush();
    type(root.querySelector("#dt"), "One edited");
    await flush();
    expect(root.querySelector('[data-id="c1"] > span').textContent).toBe("One edited");
    expect(draft.value).toBe("half typed");
    expect(root.querySelector('[data-id="c1"]').hasAttribute("text")).toBe(false);
  });
});
