import { mount, type, Sap } from "./helpers/mount.js";

describe("reactivity: calc, paint, and the one write path", () => {
  test("calc + format paints on mount", () => {
    const root = mount(`
      <main app>
        <input type="number" bind="qty" value="2">
        <input type="number" bind="price" value="10">
        <output calc:total="state.qty * state.price" text:usd="state.total"></output>
      </main>`);
    expect(root.querySelector("output").textContent).toBe("$20");
  });

  test("a keystroke recomputes through synthetic events", async () => {
    const root = mount(`
      <main app>
        <input type="number" bind="qty" value="2">
        <output calc:d="state.qty * 2" text="state.d"></output>
      </main>`);
    type(root.querySelector("[bind=qty]"), 5);
    await flush();
    expect(root.querySelector("output").textContent).toBe("10");
  });

  test("Sap(el) proxy write + Sap.refresh reads on the next line", () => {
    const root = mount(`
      <main app>
        <input type="number" bind="qty" value="2">
        <output calc:d="state.qty * 3" text="state.d"></output>
      </main>`);
    Sap(root.querySelector("[bind=qty]")).qty = 7;
    Sap.refresh();
    expect(root.querySelector("output").textContent).toBe("21");
  });

  test("calc: evaluates in topological order, not document order", () => {
    const root = mount(`
      <main app>
        <input type="number" bind="amt" value="100">
        <dd calc:total="state.subtotal + state.tax" text="state.total"></dd>
        <dd calc:tax="state.subtotal * 0.1"></dd>
        <dd calc:subtotal="state.amt"></dd>
      </main>`);
    expect(root.querySelector("[calc\\:total]").textContent).toBe("110");
  });

  test("nested scope reads as a field on its parent", () => {
    const root = mount(`
      <main app>
        <section scope="cart">
          <input type="number" bind="qty" value="4">
        </section>
        <output calc:n="state.cart.qty" text="state.n"></output>
      </main>`);
    expect(root.querySelector("output").textContent).toBe("4");
  });

  test("preserve-on-error: a throwing paint keeps last-good and sets a beacon", async () => {
    const root = mount(`
      <main app>
        <input bind="name" value="ok">
        <output text="state.name.toUpperCase()" id="o">OK</output>
      </main>`);
    expect(root.querySelector("#o").textContent).toBe("OK");
    // make the expression throw by feeding a non-string... actually drive a real throw:
    const root2 = mount(`
      <main app>
        <output text="state.missing.deep" id="o2">last</output>
      </main>`);
    expect(root2.querySelector("#o2").textContent).toBe("last");
    expect(root2.querySelector("#o2").getAttribute("sap-error")).toBe("E24");
  });

  test("attr: on a native boolean paints by presence", async () => {
    const root = mount(`
      <main app>
        <input type="checkbox" bind="agree">
        <button attr:disabled="!state.agree" id="b">go</button>
      </main>`);
    expect(root.querySelector("#b").hasAttribute("disabled")).toBe(true);
    type(root.querySelector("[bind=agree]"), true);
    await flush();
    expect(root.querySelector("#b").hasAttribute("disabled")).toBe(false);
  });

  test("attr: on a non-boolean paints true/false strings", () => {
    const root = mount(`
      <main app>
        <input type="checkbox" bind="on" checked>
        <li attr:aria-selected="state.on" id="li"></li>
      </main>`);
    expect(root.querySelector("#li").getAttribute("aria-selected")).toBe("true");
  });

  test("class: toggles and css: writes a custom property", () => {
    const root = mount(`
      <main app>
        <input type="number" bind="pct" value="60">
        <div class:hot="state.pct > 50" css:w="state.pct" id="d"></div>
      </main>`);
    expect(root.querySelector("#d").classList.contains("hot")).toBe(true);
    expect(root.querySelector("#d").style.getPropertyValue("--w")).toBe("60");
  });

  test("show toggles the native hidden attribute", async () => {
    const root = mount(`
      <main app>
        <input type="checkbox" bind="on" checked>
        <p show="state.on" id="p">hi</p>
      </main>`);
    expect(root.querySelector("#p").hidden).toBe(false);
    type(root.querySelector("[bind=on]"), false);
    await flush();
    expect(root.querySelector("#p").hidden).toBe(true);
  });

  test("effect= runs a statement body after paint", () => {
    const root = mount(`
      <main app>
        <input type="number" bind="n" value="7">
        <div effect="el.dataset.n = state.n" id="d"></div>
      </main>`);
    expect(root.querySelector("#d").dataset.n).toBe("7");
  });

  test("invalid= drives setCustomValidity and gates the form natively", () => {
    const root = mount(`
      <main app>
        <input bind="pw" value="abc">
        <input bind="pw2" value="xyz" id="pw2"
               invalid="state.pw2 !== state.pw && 'Passwords do not match'">
      </main>`);
    expect(root.querySelector("#pw2").validationMessage).toBe("Passwords do not match");
  });

  test("zero-byte mount: a pre-painted file writes nothing", () => {
    mount(`
      <main app>
        <input type="number" bind="qty" value="2">
        <input type="number" bind="price" value="10">
        <output calc:total="state.qty * state.price" text:usd="state.total">$20</output>
      </main>`);
    expect(Sap.status().apps[0].mountWrites).toBe(0);
  });

  test("the circuit breaker halts a runaway recompute loop with E26", async () => {
    const root = mount(`
      <main app>
        <input bind="n" value="x" effect="el.dispatchEvent(new Event('input',{bubbles:true}))">
      </main>`);
    // kick off the loop with one real interaction (the mount pass fires before
    // the app is registered, so it cannot start the loop on its own)
    root.querySelector("[bind=n]").dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const codes = Sap.report().errors.map((e) => e.code);
    expect(codes).toContain("E26");
  });
});
