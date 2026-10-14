import { mount, Sap } from "./helpers/mount.js";

const codesFor = (html) => {
  mount(html);
  return Sap.report().errors.map((e) => e.code);
};

describe("native boolean state", () => {
  test("<details open> reads and writes by presence through the proxy", async () => {
    const root = mount(`<main sap><details scope="sec" state="open" open><summary>A</summary></details><span id="o" text="state.sec.open ? 'open' : 'closed'">open</span></main>`);
    const d = root.querySelector("details");
    expect(Sap(d).open).toBe(true);
    Sap(d).open = false;
    await flush();
    expect(d.hasAttribute("open")).toBe(false);
    expect(d.open).toBe(false);
    expect(root.querySelector("#o").textContent).toBe("closed");
    Sap(d).open = true;
    await flush();
    expect(d.getAttribute("open")).toBe("");
    expect(root.querySelector("#o").textContent).toBe("open");
  });

  test("an explicit :bool on a native attribute also uses presence", async () => {
    const root = mount(`<main sap><details scope="sec" state="open:bool" open><summary>A</summary></details></main>`);
    const d = root.querySelector("details");
    Sap(d).open = false;
    await flush();
    expect(d.hasAttribute("open")).toBe(false);
  });

  test("novalidate is recognized through its noValidate property", async () => {
    const root = mount(`<main sap><form scope="f" state="novalidate" novalidate><span id="o" text="state.novalidate ? 'off' : 'on'">off</span></form></main>`);
    const f = root.querySelector("form");
    expect(Sap(f).novalidate).toBe(true);
    Sap(f).novalidate = false;
    await flush();
    expect(f.hasAttribute("novalidate")).toBe(false);
    expect(root.querySelector("#o").textContent).toBe("on");
  });
});

describe(":presence fields", () => {
  test("present reads true, absent reads false, writes add or remove the attribute", async () => {
    const root = mount(`<main sap><ul items="checks">
      <li item data-id="a" state="data-done:presence" data-done>one</li>
      <li item data-id="b" state="data-done:presence">two</li>
    </ul><output id="n" text="count(state.checks, c => c.done)">1</output></main>`);
    const [a, b] = root.querySelectorAll("li");
    expect(Sap(a).done).toBe(true);
    expect(Sap(b).done).toBe(false);
    Sap(a).done = false;
    Sap(b).done = true;
    await flush();
    expect(a.hasAttribute("data-done")).toBe(false);
    expect(b.getAttribute("data-done")).toBe("");
    expect(root.querySelector("#n").textContent).toBe("1");
  });

  test("any value counts as present, including the text false", () => {
    const root = mount(`<main sap><section scope="s" state="data-done:presence" data-done="false"></section></main>`);
    expect(Sap(root.querySelector("section")).done).toBe(true);
  });

  test("a default is a reset target only", async () => {
    const root = mount(`<main sap><section scope="s" state="data-pinned:presence=true"><button trigger-reset>reset</button></section></main>`);
    const s = root.querySelector("section");
    expect(Sap(s).pinned).toBe(false);
    expect(s.hasAttribute("data-pinned")).toBe(false);
    expect(Sap.status().apps[0].mountWrites).toBe(0);
    root.querySelector("button").click();
    await flush();
    expect(s.getAttribute("data-pinned")).toBe("");
    Sap(s).pinned = false;
    await flush();
    expect(s.hasAttribute("data-pinned")).toBe(false);
  });

  test("a visibility verb never materializes an absent presence attribute", async () => {
    const root = mount(`<main sap><section scope="s" state="data-done:presence"><p show-when:data-done="true">x</p></section></main>`);
    const s = root.querySelector("section");
    Sap.refresh();
    expect(s.hasAttribute("data-done")).toBe(false);
    Sap(s).done = true;
    await flush();
    Sap(s).done = false;
    await flush();
    Sap.refresh();
    expect(s.hasAttribute("data-done")).toBe(false);
  });
});

describe(":bool keeps words", () => {
  test(":bool on a data-* attribute still writes true and false", async () => {
    const root = mount(`<main sap><section scope="s" state="data-flag:bool"></section></main>`);
    const s = root.querySelector("section");
    Sap(s).flag = true;
    await flush();
    expect(s.getAttribute("data-flag")).toBe("true");
    Sap(s).flag = false;
    await flush();
    expect(s.getAttribute("data-flag")).toBe("false");
  });

  test("the proxy reads a declared default when the attribute is absent", () => {
    const root = mount(`<main sap><section scope="s" state="data-pinned:bool=true n:num=5"><span id="o" text="state.pinned + ',' + state.n">true,5</span></section></main>`);
    const s = root.querySelector("section");
    expect(Sap(s).pinned).toBe(true);
    expect(Sap(s).n).toBe(5);
  });
});

describe("E35", () => {
  test("halts on checked state on a checkbox, a number on a native boolean, and transient presence", () => {
    expect(codesFor(`<main sap><input type="checkbox" state="checked"></main>`)).toContain("E35");
    expect(codesFor(`<main sap><details scope="d" state="open:num"></details></main>`)).toContain("E35");
    expect(codesFor(`<main sap><section scope="s" state="data-x:presence:transient"></section></main>`)).toContain("E35");
    expect(codesFor(`<main sap><details scope="d" state="open:transient"></details></main>`)).toContain("E35");
  });

  test("a plain selected field on a non-control element is allowed", () => {
    expect(codesFor(`<main sap><section scope="s" state="selected"></section></main>`)).not.toContain("E35");
  });
});
