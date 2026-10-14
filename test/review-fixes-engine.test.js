import { mount, type, Sap } from "./helpers/mount.js";

const codes = () => Sap.report().errors.map((e) => e.code);

describe("view-row writes go where the pass paints from", () => {
  test("a nested each row bind displays and writes the root field, not the outer record", async () => {
    const root = mount(`
      <main sap state="q" q="root">
        <section items="cards" hidden>
          <article item data-id="c1" state="data-q" data-q="record"><span bind="title">One</span></article>
        </section>
        <ul id="outer" each="state.cards"><template><li><ol each="[{ k: 1 }]" key="item.k"><template><li><input class="q" bind="q"><button class="set" set:q="'clicked'">s</button></li></template></ol></li></template></ul>
      </main>`);
    const input = root.querySelector("input.q");
    expect(input.value).toBe("root");
    type(input, "typed");
    await flush();
    expect(Sap(root).q).toBe("typed");
    expect(root.querySelector('[data-id="c1"]').getAttribute("data-q")).toBe("record");
    root.querySelector("button.set").click();
    await flush();
    expect(Sap(root).q).toBe("clicked");
    expect(root.querySelector('[data-id="c1"]').getAttribute("data-q")).toBe("record");
  });

  test("typing into an unresolved bind writes nothing and stays E43", async () => {
    const root = mount(`<main sap><ul each="[{ k: 1 }]" key="item.k"><template><li><input bind="missing"></li></template></ul></main>`);
    expect(codes()).toContain("E43");
    type(root.querySelector("ul input"), "typed");
    await flush();
    expect(root.hasAttribute("missing")).toBe(false);
    expect(root.getAttribute("state") || "").not.toContain("missing");
    expect(codes()).toContain("E43");
  });

  test("a write from the row of a just-removed record goes nowhere", async () => {
    const root = mount(`
      <main sap>
        <section items="cards" hidden>
          <article item data-id="c1" state="data-done:presence"><span bind="title">One</span></article>
        </section>
        <ul id="v" each="state.cards"><template><li><input type="checkbox" bind="done"></li></template></ul>
      </main>`);
    const box = root.querySelector("#v input");
    root.querySelector('[data-id="c1"]').remove();
    type(box, true);
    await flush();
    expect(root.hasAttribute("done")).toBe(false);
    expect(root.getAttribute("state") || "").not.toContain("done");
  });
});

describe("clone ids", () => {
  test("a label follows the new HTML id even when id and data-id share a value", () => {
    const root = mount(`<main sap><ul items="rows"><li item template data-id=""><label for="f">n</label><input id="f" data-id="f"></li></ul></main>`);
    const row = Sap(root).$add("rows").$el;
    expect(row.querySelector("label").getAttribute("for")).toBe(row.querySelector("input").id);
  });

  test("a reference to an id outside the clone is left alone", () => {
    const root = mount(`<main sap><p id="help">h</p><ul items="rows"><li item template data-id=""><input data-id="help" aria-describedby="help"></li></ul></main>`);
    const row = Sap(root).$add("rows").$el;
    expect(row.querySelector("input").getAttribute("aria-describedby")).toBe("help");
  });
});

describe("controls", () => {
  test("attr:selected on an option of a bound select is E30", () => {
    mount(`<main sap state="s"><select bind="choice"><option value="a" attr:selected="state.s === 'a'">a</option><option value="b">b</option></select></main>`);
    expect(codes()).toContain("E30");
  });

  test("a composer radio group fills a declared field with the checked value", async () => {
    const root = mount(`
      <main sap>
        <ul items="tasks"><li item template data-id="" state="data-priority"><span bind="title"></span></li></ul>
        <form trigger-add="tasks"><input bind="title" value="T"><input type="radio" bind="priority" value="high" checked><input type="radio" bind="priority" value="low"></form>
      </main>`);
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(root.querySelector("ul > li[item]:not([template])").getAttribute("data-priority")).toBe("high");
  });

  test("radios in view rows write nothing on an idle pass", async () => {
    const root = mount(`
      <main sap>
        <section items="cards" hidden>
          <article item data-id="a" state="data-pick" data-pick="x"><span bind="title">A</span></article>
          <article item data-id="b" state="data-pick" data-pick="y"><span bind="title">B</span></article>
        </section>
        <ul each="state.cards"><template><li><input type="radio" value="x" bind="pick"></li></template></ul>
      </main>`);
    let n = 0;
    root.addEventListener("sap:views-updated", () => n++);
    Sap.refresh();
    Sap.refresh();
    Sap.refresh();
    expect(n).toBe(0);
    const radios = root.querySelectorAll("ul input");
    expect([...radios].map((r) => r.checked)).toEqual([true, false]);
  });
});

describe("detail and blueprints", () => {
  test("detail never matches a flattened primitive", () => {
    const root = mount(`
      <main sap>
        <ul items="lists"><li item data-id="l" state="data-cards:num" data-cards="7"></li></ul>
        <aside detail="lists.cards by state.selected"><span text="item"></span></aside>
      </main>`);
    expect(root.querySelector("aside").hidden).toBe(true);
  });

  test("a list inside a shared blueprint finds the shared blueprint during lint", () => {
    mount(`
      <main sap>
        <section items="lists">
          <div item data-id="l1"><ul items="cards"></ul><button trigger-add="cards">+</button></div>
        </section>
        <template items="lists"><div item data-id=""><ul items="cards"></ul><button trigger-add="cards">+</button></div></template>
        <template items="cards"><li item data-id=""><span bind="title">New</span></li></template>
      </main>`);
    expect(codes()).toEqual([]);
  });
});
