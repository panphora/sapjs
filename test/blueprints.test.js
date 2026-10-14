import { mount, type, Sap } from "./helpers/mount.js";

const codes = () => Sap.report().errors.map((e) => e.code);

const BOARD = `
  <main sap>
    <section items="lists">
      <div item template data-id=""><ul items="cards"></ul><button class="add" trigger-add="cards">+</button></div>
      <div item data-id="l1"><ul items="cards"></ul><button class="add" trigger-add="cards">+</button></div>
      <div item data-id="l2"><ul items="cards"><li item data-id="c9"><span bind="title">Nine</span></li></ul><button class="add" trigger-add="cards">+</button></div>
    </section>
    <template items="cards"><li item data-id=""><span bind="title">New card</span></li></template>
    <output id="n" text="state.lists.map(l => l.cards.length).join(',')"></output>
    <output id="root" text="'cards' in state ? 'leak' : 'ok'"></output>
  </main>`;

describe("shared blueprints", () => {
  test("a list without its own template row adds from the shared blueprint", async () => {
    const root = mount(BOARD);
    expect(codes()).toEqual([]);
    expect(root.querySelector("#n").textContent).toBe("0,1");
    expect(root.querySelector("#root").textContent).toBe("ok");
    root.querySelector('[data-id="l1"] .add').click();
    await flush();
    const added = root.querySelector('[data-id="l1"] ul > li');
    expect(added).not.toBeNull();
    expect(added.hasAttribute("template")).toBe(false);
    expect(added.getAttribute("data-id")).not.toBe("");
    expect(added.textContent).toBe("New card");
    expect(root.querySelector("#n").textContent).toBe("1,1");
    expect(root.querySelector("template[items=cards]").content.children.length).toBe(1);
  });

  test("a list's own template row wins over the shared blueprint", async () => {
    const root = mount(BOARD.replace('<ul items="cards"></ul><button class="add" trigger-add="cards">+</button></div>\n      <div item data-id="l2">',
      '<ul items="cards"><li item template data-id=""><span bind="title">Own</span></li></ul><button class="add" trigger-add="cards">+</button></div>\n      <div item data-id="l2">'));
    root.querySelector('[data-id="l1"] .add').click();
    await flush();
    expect(root.querySelector('[data-id="l1"] ul > li[item]:not([template])').textContent).toBe("Own");
  });

  test("lint checks the blueprint's content", () => {
    mount(`<main sap><ul items="files"></ul><template items="files"><li item data-id=""><input type="file" bind="f"></li></template></main>`);
    expect(codes()).toContain("E32");
  });
});

describe("composer forms fill declared fields", () => {
  test("a composer value reaches a state= field on the new row", async () => {
    const root = mount(`
      <main sap>
        <ul items="links"><li item template data-id="" state="data-href"><span bind="label"></span></li></ul>
        <form trigger-add="links"><input id="l" bind="label"><input id="h" bind="href"></form>
      </main>`);
    type(root.querySelector("#l"), "Docs");
    type(root.querySelector("#h"), "https://example.com");
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    const row = root.querySelector("ul > li[item]:not([template])");
    expect(row.querySelector("span").textContent).toBe("Docs");
    expect(row.getAttribute("data-href")).toBe("https://example.com");
    expect(root.querySelector("#h").value).toBe("");
  });
});
