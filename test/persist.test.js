import { mount, type } from "./helpers/mount.js";

// persist is opt-in durability, honored by the sap engine itself (no host
// platform required). bind is reactivity; persist is what makes a typed value
// survive a save. Without persist, sap leaves the serializable attribute alone.

describe("persist: opt-in durability honored by the sap engine", () => {
  test("a [persist] text input mirrors its typed value to the attribute", () => {
    const root = mount(`<main sap><input bind="name" value="Ada" persist></main>`);
    type(root.querySelector("[bind=name]"), "Bob");
    expect(root.querySelector("[bind=name]").getAttribute("value")).toBe("Bob");
  });

  test("a bound input WITHOUT persist does not mirror (opt-in only)", () => {
    const root = mount(`<main sap><input bind="name" value="Ada"></main>`);
    type(root.querySelector("[bind=name]"), "Bob");
    expect(root.querySelector("[bind=name]").getAttribute("value")).toBe("Ada");
  });

  test("a [persist] checkbox mirrors its checked state both ways", () => {
    const root = mount(`<main sap><input type="checkbox" bind="done" persist></main>`);
    const box = root.querySelector("[bind=done]");
    type(box, true);
    expect(box.hasAttribute("checked")).toBe(true);
    type(box, false);
    expect(box.hasAttribute("checked")).toBe(false);
  });

  test("a [persist] select mirrors the chosen option", () => {
    const root = mount(`<main sap><select bind="plan" persist><option value="free">Free</option><option value="pro" selected>Pro</option></select></main>`);
    type(root.querySelector("[bind=plan]"), "free");
    const [free, pro] = root.querySelectorAll("option");
    expect(free.hasAttribute("selected")).toBe(true);
    expect(pro.hasAttribute("selected")).toBe(false);
  });

  test("persist needs no bind — durability is independent of reactivity", () => {
    const root = mount(`<main sap><input name="note" value="" persist></main>`);
    type(root.querySelector("[name=note]"), "kept");
    expect(root.querySelector("[name=note]").getAttribute("value")).toBe("kept");
  });

  test("on mount, a textarea[data-value] is rehydrated from the persisted value", () => {
    const root = mount(`<main sap><textarea bind="bio" data-value="restored">stale</textarea></main>`);
    const ta = root.querySelector("textarea");
    expect(ta.value).toBe("restored");
    expect(ta.hasAttribute("data-value")).toBe(false);
  });

  test("a rehydrated textarea round-trips through a plain outerHTML save", () => {
    const root = mount(`<main sap><textarea bind="bio" data-value="restored">stale</textarea></main>`);
    const html = root.outerHTML;
    expect(html).toContain(">restored</textarea>");
    expect(html).not.toContain("data-value");
  });

  test("a textarea without data-value loads its textContent unchanged", () => {
    const root = mount(`<main sap><textarea bind="bio">plain</textarea></main>`);
    expect(root.querySelector("textarea").value).toBe("plain");
  });
});
