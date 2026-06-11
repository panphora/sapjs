import { carrierFor, kindOf } from "../src/carrier.js";

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild;
}

describe("carrier control matrix", () => {
  test("classifies control shapes", () => {
    expect(kindOf(el('<input type="number">'))).toBe("number");
    expect(kindOf(el('<input type="checkbox">'))).toBe("checkbox");
    expect(kindOf(el('<input type="radio">'))).toBe("radio");
    expect(kindOf(el('<input type="hidden">'))).toBe("hidden");
    expect(kindOf(el("<textarea></textarea>"))).toBe("text");
    expect(kindOf(el("<select></select>"))).toBe("select-one");
    expect(kindOf(el("<select multiple></select>"))).toBe("select-multiple");
    expect(kindOf(el("<span></span>"))).toBe("leaf");
  });

  test("text round-trips read(write(v)) === v", () => {
    const c = carrierFor(el('<input type="text">'));
    c.write("hello", { silent: true });
    expect(c.read()).toBe("hello");
  });

  test("number reads as a number; empty is 0", () => {
    const c = carrierFor(el('<input type="number" value="3">'));
    expect(c.read()).toBe(3);
    const empty = carrierFor(el('<input type="number">'));
    expect(empty.read()).toBe(0);
  });

  test("checkbox round-trips a boolean and mirrors to the attribute", () => {
    const node = el('<input type="checkbox">');
    const c = carrierFor(node);
    c.write(true, { silent: true });
    expect(c.read()).toBe(true);
    expect(node.hasAttribute("checked")).toBe(true);
    c.write(false, { silent: true });
    expect(node.hasAttribute("checked")).toBe(false);
  });

  test("select-multiple reads and writes an array", () => {
    const node = el('<select multiple><option value="a">a</option><option value="b">b</option><option value="c">c</option></select>');
    const c = carrierFor(node);
    c.write(["a", "c"], { silent: true });
    expect(c.read()).toEqual(["a", "c"]);
  });

  test("leaf binds textContent", () => {
    const node = el("<span></span>");
    const c = carrierFor(node);
    c.write("Alice", { silent: true });
    expect(c.read()).toBe("Alice");
    expect(node.textContent).toBe("Alice");
  });

  test("write fires synthetic input + change unless silent", () => {
    const node = el('<input type="text">');
    const c = carrierFor(node);
    const seen = [];
    node.addEventListener("input", () => seen.push("input"));
    node.addEventListener("change", () => seen.push("change"));
    c.write("x", { silent: true });
    expect(seen).toEqual([]);
    c.write("y");
    expect(seen).toEqual(["input", "change"]);
  });

  test("text mirror writes the value attribute so the saved DOM reflects state", () => {
    const node = el('<input type="text">');
    carrierFor(node).write("saved", { silent: true });
    expect(node.getAttribute("value")).toBe("saved");
  });
});
