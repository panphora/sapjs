import { mount, Sap } from "./helpers/mount.js";

const APP = `
  <main app>
    <input type="number" bind="qty" value="2">
    <input type="number" bind="price" value="10">
    <output calc:total="state.qty * state.price" text:usd="state.total">$20</output>
    <ul items="lines">
      <li item template><span bind="x"></span></li>
      <li item><span bind="x">a</span></li>
    </ul>
    <button trigger-add="lines">add</button>
  </main>`;

describe("the console surface", () => {
  test("Sap.status() reports a machine-readable twin of the green line", () => {
    mount(APP);
    const s = Sap.status();
    expect(s.ok).toBe(true);
    const a = s.apps[0];
    expect(a.root).toBe("main[app]");
    expect(a.calcs).toBe(1);
    expect(a.lists).toBe(1);
    expect(a.rows).toBe(1);
    expect(a.mountWrites).toBe(0);
    expect(a.actions).toBeGreaterThanOrEqual(1);
  });

  test("the green line matches the frozen regex grammar", () => {
    const root = mount(APP);
    const line = Sap.greenLine(Sap._registry.get(root));
    expect(line).toMatch(/^sap [✓✗] \S+(?: · [a-z ]+ \d+)+ · \d+(?:\.\d+)?ms$/);
    expect(line).toContain("mount writes 0");
  });

  test("Sap.report() is a JSON twin with stable codes", () => {
    mount(`<main app><span x-text="a">hi</span></main>`);
    const r = Sap.report();
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ code: "E01", slug: "foreign-dialect" });
    expect(typeof r.errors[0].el).toBe("string");
  });

  test("Sap.lastPass proves an interaction caused a repaint", async () => {
    const root = mount(APP);
    root.querySelector("[bind=qty]").value = "3";
    root.querySelector("[bind=qty]").dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(Sap.status().apps[0].lastPass.writes).toBeGreaterThan(0);
  });

  test("Sap.doctor() returns an audit array and prints a summary", () => {
    mount(APP);
    const findings = Sap.doctor();
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.every((f) => f.code && f.severity && f.message)).toBe(true);
  });

  test("Sap.doctor flags dead state", () => {
    mount(`<main app state="used unused"><output text="state.used"></output></main>`);
    const dead = Sap.doctor().filter((f) => /dead state/.test(f.message));
    expect(dead.some((f) => /unused/.test(f.message))).toBe(true);
  });

  test("Sap.why() inspects an element without throwing", () => {
    const root = mount(APP);
    expect(() => Sap.why(root.querySelector("output"))).not.toThrow();
    expect(() => Sap.why("output", "total")).not.toThrow();
  });

  test("Sap.debug() toggles per-pass logging", () => {
    mount(APP);
    expect(Sap.debug(true)).toBe(true);
    expect(Sap.debug(false)).toBe(false);
  });
});
