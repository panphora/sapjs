import { serializeControlToAttributes, finalizeControlForSave } from "../src/control-serialize.js";

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild;
}

describe("serializeControlToAttributes (live, cursor-safe)", () => {
  test("text input writes the value attribute", () => {
    const node = el('<input type="text" value="old">');
    node.value = "new";
    serializeControlToAttributes(node);
    expect(node.getAttribute("value")).toBe("new");
  });

  test("checkbox toggles the checked attribute both ways", () => {
    const node = el('<input type="checkbox">');
    node.checked = true;
    serializeControlToAttributes(node);
    expect(node.hasAttribute("checked")).toBe(true);
    node.checked = false;
    serializeControlToAttributes(node);
    expect(node.hasAttribute("checked")).toBe(false);
  });

  test("select moves the selected attribute to the live choice", () => {
    const node = el('<select><option value="free">Free</option><option value="pro" selected>Pro</option></select>');
    node.value = "free";
    serializeControlToAttributes(node);
    const [free, pro] = node.options;
    expect(free.hasAttribute("selected")).toBe(true);
    expect(pro.hasAttribute("selected")).toBe(false);
  });

  test("textarea writes data-value, not textContent (cursor-safe)", () => {
    const node = el("<textarea>old</textarea>");
    node.value = "new";
    serializeControlToAttributes(node);
    expect(node.getAttribute("data-value")).toBe("new");
    expect(node.textContent).toBe("old");
  });

  test("contenteditable / other elements are a no-op (round-trip natively)", () => {
    const node = el('<span contenteditable>text</span>');
    serializeControlToAttributes(node);
    expect(node.attributes.length).toBe(1); // only contenteditable
  });
});

describe("finalizeControlForSave (save, clone <- live)", () => {
  test("writes the clone's attributes from the live source", () => {
    const live = el('<input type="text">');
    live.value = "typed";
    const clone = el('<input type="text" value="stale">');
    finalizeControlForSave(clone, live);
    expect(clone.getAttribute("value")).toBe("typed");
  });

  test("resolves a textarea data-value into real textContent and strips it", () => {
    const live = el("<textarea>seed</textarea>");
    live.value = "edited";
    const clone = el('<textarea data-value="edited">seed</textarea>');
    finalizeControlForSave(clone, live);
    expect(clone.textContent).toBe("edited");
    expect(clone.hasAttribute("data-value")).toBe(false);
  });

  test("syncs select selection from live onto the clone", () => {
    const live = el('<select><option value="free">Free</option><option value="pro" selected>Pro</option></select>');
    live.value = "free";
    const clone = el('<select><option value="free">Free</option><option value="pro" selected>Pro</option></select>');
    finalizeControlForSave(clone, live);
    const [free, pro] = clone.options;
    expect(free.hasAttribute("selected")).toBe(true);
    expect(pro.hasAttribute("selected")).toBe(false);
  });
});
