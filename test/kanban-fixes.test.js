import { mount, Sap } from "./helpers/mount.js";

describe("clone hygiene", () => {
  test("$add re-mints nested data-ids and rewrites id references", () => {
    const root = mount(`
      <main sap>
        <ul items="cards">
          <li item template data-id="">
            <section class="k" data-id="k-tpl"><ul><li class="i" data-id="i-tpl">step</li></ul></section>
            <button popovertarget="menu-tpl">open</button><div id="menu-tpl" popover></div>
            <label for="f-tpl">name</label><input id="f-tpl">
          </li>
        </ul>
      </main>`);
    const a = Sap(root).$add("cards");
    const b = Sap(root).$add("cards");
    const ids = [...root.querySelectorAll("[data-id]")].map((e) => e.getAttribute("data-id")).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of [a.$el, b.$el]) {
      const menu = row.querySelector("[popover]");
      expect(menu.id).not.toBe("menu-tpl");
      expect(row.querySelector("[popovertarget]").getAttribute("popovertarget")).toBe(menu.id);
      expect(row.querySelector("label").getAttribute("for")).toBe(row.querySelector("input").id);
    }
  });
});

describe("row-level bind", () => {
  test("a write to a bind on the row element itself reaches that element", async () => {
    const root = mount(`<main sap><ul items="tags"><li item data-id="t1" bind="label">alpha</li></ul></main>`);
    const row = root.querySelector("li");
    expect(Sap(row).label).toBe("alpha");
    Sap(row).label = "beta";
    await flush();
    expect(row.textContent).toBe("beta");
    expect(root.hasAttribute("label")).toBe(false);
    expect(root.getAttribute("state") || "").not.toContain("label");
  });
});

describe("attr:checked on an unbound control", () => {
  test("moves the live box even after a user click", async () => {
    const root = mount(`<main sap state="on:bool"><input id="c" type="checkbox" attr:checked="state.on"></main>`);
    const box = root.querySelector("#c");
    box.checked = true;
    Sap(root).on = true;
    await flush();
    Sap(root).on = false;
    await flush();
    expect(box.checked).toBe(false);
    expect(box.hasAttribute("checked")).toBe(false);
    Sap(root).on = true;
    await flush();
    expect(box.checked).toBe(true);
    expect(box.hasAttribute("checked")).toBe(true);
  });
});

describe("route changes", () => {
  test("a clay:route event re-derives every app", () => {
    const root = mount(`<main sap><span id="o" text="window.__route || ''"></span></main>`);
    window.__route = "card-1";
    document.dispatchEvent(new CustomEvent("clay:route"));
    expect(root.querySelector("#o").textContent).toBe("card-1");
    delete window.__route;
  });
});
