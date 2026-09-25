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

  test("keeps a textarea value's leading newlines through a save and reload", () => {
    const live = el("<textarea></textarea>");
    live.value = "\n\nstarts after a blank line";
    const clone = el("<textarea></textarea>");
    finalizeControlForSave(clone, live);
    const reloaded = el(clone.outerHTML);
    expect(reloaded.value).toBe("\n\nstarts after a blank line");

    const cloneAgain = el(clone.outerHTML);
    finalizeControlForSave(cloneAgain, reloaded);
    expect(el(cloneAgain.outerHTML).value).toBe("\n\nstarts after a blank line");
  });

  test("writes a value without a leading newline unchanged", () => {
    const live = el("<textarea></textarea>");
    live.value = "no blank line\n\nhere";
    const clone = el("<textarea></textarea>");
    finalizeControlForSave(clone, live);
    expect(clone.textContent).toBe("no blank line\n\nhere");
    expect(el(clone.outerHTML).value).toBe("no blank line\n\nhere");
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

  test("leaves an empty input with no value attribute alone, since it reloads the same", () => {
    const live = el('<input type="text" placeholder="name">');
    const clone = el('<input type="text" placeholder="name">');
    finalizeControlForSave(clone, live);
    expect(clone.hasAttribute("value")).toBe(false);
  });

  test("leaves a value attribute that already says the live value alone", () => {
    const live = el('<input type="text" value="same">');
    const clone = el('<input type="text" value="same">');
    finalizeControlForSave(clone, live);
    expect(clone.getAttribute("value")).toBe("same");
  });

  test("still writes an empty value over a stale one", () => {
    const live = el('<input type="text" value="old">');
    live.value = "";
    const clone = el('<input type="text" value="old">');
    finalizeControlForSave(clone, live);
    expect(clone.getAttribute("value")).toBe("");
  });

  test("keeps the author's spelling of checked and selected while they are still true", () => {
    const live = el('<input type="checkbox" checked="checked">');
    const clone = el('<input type="checkbox" checked="checked">');
    finalizeControlForSave(clone, live);
    expect(clone.getAttribute("checked")).toBe("checked");

    const liveSel = el('<select><option>a</option><option selected="selected">b</option></select>');
    const cloneSel = el('<select><option>a</option><option selected="selected">b</option></select>');
    finalizeControlForSave(cloneSel, liveSel);
    expect(cloneSel.options[1].getAttribute("selected")).toBe("selected");
    expect(cloneSel.options[0].hasAttribute("selected")).toBe(false);
  });

  test("leaves a textarea's text node alone when it already holds the live value", () => {
    const live = el("<textarea>seed</textarea>");
    const clone = el("<textarea>seed</textarea>");
    const text = clone.firstChild;
    finalizeControlForSave(clone, live);
    expect(clone.firstChild).toBe(text);
  });
});
