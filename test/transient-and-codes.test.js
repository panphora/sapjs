import { mount, type, Sap } from "./helpers/mount.js";
import { carrierFor } from "../src/carrier.js";

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild;
}

function codesFor(html) {
  mount(html);
  return Sap.report().errors.map((e) => e.code);
}

describe("transient: values drive the app but never serialize into the file", () => {
  test("a transient control mirrors nothing — the value attribute is stripped, not written", () => {
    const node = el('<input type="search" bind="q" transient>');
    node.setAttribute("value", "stale"); // a value left over from a previous save
    const c = carrierFor(node);
    c.write("hello", { silent: true });
    expect(c.read()).toBe("hello"); // the live value still works
    expect(node.hasAttribute("value")).toBe(false); // but it is not serialized
  });

  test("a transient checkbox does not mirror its checked attribute", () => {
    const node = el('<input type="checkbox" bind="on" transient checked>');
    const c = carrierFor(node);
    c.write(true, { silent: true });
    expect(c.read()).toBe(true);
    expect(node.hasAttribute("checked")).toBe(false);
  });

  test("a stale value attribute on a transient control is stripped on the next pass", async () => {
    const root = mount(`<main sap><input type="password" bind="pw" transient></main>`);
    const input = root.querySelector("[bind=pw]");
    input.setAttribute("value", "leaked"); // simulate a value baked into the file
    type(input, "secret123");
    await flush();
    expect(input.value).toBe("secret123"); // live property carries it
    expect(input.hasAttribute("value")).toBe(false); // the file does not
  });

  test("a Sap() write to a transient control keeps the value out of the attribute", () => {
    const root = mount(`<main sap><input type="search" bind="q" transient></main>`);
    Sap(root.querySelector("[bind=q]")).q = "apple";
    Sap.refresh();
    const input = root.querySelector("[bind=q]");
    expect(input.value).toBe("apple");
    expect(input.hasAttribute("value")).toBe(false);
  });

  test('state="x:transient" drives calc but never writes a value attribute', () => {
    const root = mount(
      `<main sap state="secret:transient=hi"><output calc:len="state.secret.length" text="state.len"></output></main>`
    );
    expect(root.querySelector("output").textContent).toBe("2");
    expect(root.hasAttribute("secret")).toBe(false); // value is runtime-only
    expect(root.getAttribute("state")).toContain("secret:transient"); // declaration stays
  });

  test("writing a transient state field updates the runtime value, not the saved DOM", () => {
    const root = mount(
      `<main sap state="secret:transient"><output calc:len="state.secret.length" text="state.len"></output></main>`
    );
    Sap(root).secret = "longer";
    Sap.refresh();
    expect(root.querySelector("output").textContent).toBe("6");
    expect(root.hasAttribute("secret")).toBe(false);
  });

  test("a leaked value attribute on a transient state field is scrubbed at mount", () => {
    const root = mount(
      `<main sap state="secret:transient" secret="leaked"><output calc:len="state.secret.length" text="state.len"></output></main>`
    );
    expect(root.querySelector("output").textContent).toBe("6"); // seeded from the attribute
    expect(root.hasAttribute("secret")).toBe(false); // then scrubbed so it never re-saves
  });

  test("a transient state field resets to its default through the runtime store", () => {
    const root = mount(
      `<main sap state="secret:transient=hi"><button id="r" onclick="Sap(this).$reset()">reset</button></main>`
    );
    Sap(root).secret = "changed";
    Sap.refresh();
    expect(Sap(root).secret).toBe("changed");
    root.querySelector("#r").click();
    Sap.refresh();
    expect(Sap(root).secret).toBe("hi");
    expect(root.hasAttribute("secret")).toBe(false);
  });
});

describe("E12 / E15: undeclared writes fail loud instead of auto-declaring a phantom field", () => {
  test("E12 catches a typo of a declared field, with a did-you-mean, and refuses the write", () => {
    const root = mount(`<main sap state="count:num=3"></main>`);
    Sap(root).coint = 5; // typo of count
    const e = Sap.report().errors.find((x) => x.code === "E12");
    expect(e).toBeTruthy();
    expect(e.didYouMean).toBe("count");
    expect(root.getAttribute("state")).toBe("count:num=3"); // not auto-declared
  });

  test("E15 refuses an undeclared write to a reserved/global name", () => {
    const root = mount(`<main sap></main>`);
    Sap(root).title = "hi"; // 'title' is an HTML global — can never become state
    const e = Sap.report().errors.find((x) => x.code === "E15");
    expect(e).toBeTruthy();
    expect(root.hasAttribute("state")).toBe(false);
  });

  test("a genuinely new field still auto-declares (DOM-as-truth preserved)", () => {
    const root = mount(`<main sap></main>`);
    Sap(root).tally = 7;
    expect(Sap.report().errors.length).toBe(0);
    expect(root.getAttribute("state")).toContain("tally");
  });

  test("a short new field name is not mistaken for a typo", () => {
    const root = mount(`<main sap state="qty:num=1"></main>`);
    Sap(root).amt = 2; // 3 chars — too short to guess as a typo of qty
    expect(Sap.report().errors.find((x) => x.code === "E12")).toBeFalsy();
    expect(root.getAttribute("state")).toContain("amt");
  });
});

describe("E20: bind on a container that is not a control", () => {
  test("E20 halts when bind would overwrite an element's children", () => {
    expect(codesFor(`<main sap><div bind="x"><span>child</span></div></main>`)).toContain("E20");
  });

  test("an empty text leaf binds fine", () => {
    expect(codesFor(`<main sap><span bind="x"></span></main>`)).not.toContain("E20");
  });

  test("a contenteditable container binds fine", () => {
    expect(codesFor(`<main sap><div contenteditable bind="x"><b>rich</b></div></main>`)).not.toContain("E20");
  });
});

describe("W30: a file that paints at mount was out of sync", () => {
  test("W30 warns (but never halts) when mount has to paint", () => {
    mount(`<main sap><input type="number" bind="qty" value="2"><output calc:d="state.qty*2" text="state.d"></output></main>`);
    expect(Sap.report().warnings.map((w) => w.code)).toContain("W30");
    expect(Sap.status().apps[0].ok).toBe(true);
  });

  test("a settled, pre-painted file does not warn", () => {
    mount(`<main sap><input type="number" bind="qty" value="2"><output calc:d="state.qty*2" text="state.d">4</output></main>`);
    expect(Sap.report().warnings.map((w) => w.code)).not.toContain("W30");
    expect(Sap.status().apps[0].mountWrites).toBe(0);
  });
});
