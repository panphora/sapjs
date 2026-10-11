import { mount, type, Sap } from "./helpers/mount.js";
import { whenPlatformReady } from "../src/platform.js";

describe("whenPlatformReady", () => {
  afterEach(() => { delete window.clay; });

  test("runs at once without ClayJS", () => {
    let ran = 0;
    whenPlatformReady(() => ran++);
    expect(ran).toBe(1);
  });

  test("waits for clay.ready to resolve", async () => {
    let resolve;
    window.clay = { ready: new Promise((r) => { resolve = r; }) };
    let ran = 0;
    whenPlatformReady(() => ran++);
    await flush();
    expect(ran).toBe(0);
    resolve(window.clay);
    await flush();
    expect(ran).toBe(1);
  });

  test("still runs when clay.ready rejects", async () => {
    window.clay = { ready: Promise.reject(new Error("boot failed")) };
    let ran = 0;
    whenPlatformReady(() => ran++);
    await flush();
    expect(ran).toBe(1);
  });

  test("ignores the deprecated hyperclay.ready", () => {
    window.hyperclay = { ready: new Promise(() => {}) };
    let ran = 0;
    whenPlatformReady(() => ran++);
    expect(ran).toBe(1);
    delete window.hyperclay;
  });
});

describe("detail resolves after intake", () => {
  test("a detail placed before its list finds the selected row", async () => {
    const root = mount(`
      <main sap state="selected">
        <header detail="entries by state.selected"><span bind="title" id="dt"></span></header>
        <section items="entries">
          <article item template data-id=""><span bind="title"></span></article>
          <article item data-id="a1" set:selected="item.$key"><span bind="title">First</span></article>
          <article item data-id="b2" set:selected="item.$key"><span bind="title">Second</span></article>
        </section>
      </main>`);
    root.querySelector('[data-id="b2"]').click();
    await flush();
    const panel = root.querySelector("header");
    expect(panel.hidden).toBe(false);
    expect(root.querySelector("#dt").textContent).toBe("Second");
  });

  test("editing through a detail placed before its list writes the row", async () => {
    const root = mount(`
      <main sap state="selected">
        <form detail="entries by state.selected"><input bind="title" id="di"></form>
        <ul items="entries">
          <li item template><input bind="title"></li>
          <li item id="p1" set:selected="item.$key"><input bind="title" value="Alice"></li>
        </ul>
      </main>`);
    root.querySelector("#p1").click();
    await flush();
    expect(root.querySelector("#di").value).toBe("Alice");
    type(root.querySelector("#di"), "Alicia");
    await flush();
    expect(root.querySelector("#p1 input").value).toBe("Alicia");
  });
});
