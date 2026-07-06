import { mount, Sap } from "./helpers/mount.js";

function arrow(el, key, shift = false) {
  const e = new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

describe("arrow-key stepping on bound text inputs", () => {
  test("ArrowUp / ArrowDown step by the step attribute", () => {
    const root = mount(`
      <main sap>
        <input bind="amt" value="200" step="10">
      </main>`);
    const el = root.querySelector("[bind=amt]");
    arrow(el, "ArrowUp");
    expect(el.value).toBe("210");
    arrow(el, "ArrowDown");
    expect(el.value).toBe("200");
  });

  test("Shift multiplies the step by 10", () => {
    const root = mount(`
      <main sap>
        <input bind="amt" value="200" step="10">
      </main>`);
    const el = root.querySelector("[bind=amt]");
    arrow(el, "ArrowUp", true);
    expect(el.value).toBe("300");
  });

  test("clamps to min and max", () => {
    const root = mount(`
      <main sap>
        <input bind="d" value="1" step="1" min="1" max="7">
      </main>`);
    const el = root.querySelector("[bind=d]");
    arrow(el, "ArrowDown");
    expect(el.value).toBe("1");
    el.value = "7";
    arrow(el, "ArrowUp");
    expect(el.value).toBe("7");
  });

  test("0.1 steps stay clean with no float tail", () => {
    const root = mount(`
      <main sap>
        <input bind="tax" value="12" step="0.1">
      </main>`);
    const el = root.querySelector("[bind=tax]");
    arrow(el, "ArrowUp");
    expect(el.value).toBe("12.1");
  });

  test("empty value steps from 0", () => {
    const root = mount(`
      <main sap>
        <input bind="amt" value="" step="10">
      </main>`);
    const el = root.querySelector("[bind=amt]");
    arrow(el, "ArrowUp");
    expect(el.value).toBe("10");
  });

  test("stepping schedules a pass so calcs see the new value", async () => {
    const root = mount(`
      <main sap>
        <input bind="amt" value="200" step="10">
        <output calc:d="state.amt * 2" text="state.d"></output>
      </main>`);
    const el = root.querySelector("[bind=amt]");
    arrow(el, "ArrowUp");
    await flush();
    expect(root.querySelector("output").textContent).toBe("420");
  });

  test("preventDefault is called on a handled step", () => {
    const root = mount(`
      <main sap>
        <input bind="amt" value="200" step="10">
      </main>`);
    const el = root.querySelector("[bind=amt]");
    const e = arrow(el, "ArrowUp");
    expect(e.defaultPrevented).toBe(true);
  });

  test("an input without a step attribute is untouched", () => {
    const root = mount(`
      <main sap>
        <input bind="amt" value="200">
      </main>`);
    const el = root.querySelector("[bind=amt]");
    const e = arrow(el, "ArrowUp");
    expect(el.value).toBe("200");
    expect(e.defaultPrevented).toBe(false);
  });

  test("an input without a bind attribute is untouched", () => {
    const root = mount(`
      <main sap>
        <input step="10" value="200">
      </main>`);
    const el = root.querySelector("input");
    const e = arrow(el, "ArrowUp");
    expect(el.value).toBe("200");
    expect(e.defaultPrevented).toBe(false);
  });

  test("a native number input is untouched (it steps itself)", () => {
    const root = mount(`
      <main sap>
        <input type="number" bind="amt" value="200" step="10">
      </main>`);
    const el = root.querySelector("[bind=amt]");
    const e = arrow(el, "ArrowUp");
    expect(el.value).toBe("200");
    expect(e.defaultPrevented).toBe(false);
  });
});
