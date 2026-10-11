import { mount, Sap } from "./helpers/mount.js";

describe("review fixes", () => {
  test("move:down inside an each row moves the source record", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template data-id=""><span bind="v"></span></li>
          <li item data-id="a"><span bind="v">a</span></li>
          <li item data-id="b"><span bind="v">b</span></li>
        </ul>
        <nav id="v" each="state.xs"><template><p><button move:down>down</button></p></template></nav>
      </main>`);
    root.querySelector('#v > [data-key="a"] button').click();
    await flush();
    expect([...root.querySelectorAll("ul > [item]:not([template])")].map((li) => li.dataset.id)).toEqual(["b", "a"]);
  });

  test("a data-* field named like a native boolean reads its data attribute", async () => {
    const root = mount(`
      <main sap>
        <details scope="rec" state="data-open" data-open="archived"><summary>x</summary></details>
        <output text="state.rec.open"></output>
      </main>`);
    await flush();
    expect(root.querySelector("output").textContent).toBe("archived");
  });

  test("data-* fields named like reserved words mount", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template state="data-sort data-text"></li>
          <li item state="data-sort data-text" data-sort="3" data-text="hi"></li>
        </ul>
        <output text="state.xs[0].sort + state.xs[0].text"></output>
      </main>`);
    expect(Sap.report().errors.map((e) => e.code)).not.toContain("E05");
    await flush();
    expect(root.querySelector("output").textContent).toBe("3hi");
  });

  test("a bare reserved field name still halts", () => {
    mount(`<main sap><div scope="s" state="sort"></div></main>`);
    expect(Sap.report().errors.map((e) => e.code)).toContain("E05");
  });
});
