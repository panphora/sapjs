import { ownsAttr, paintsOf, stripPaints, appOf, BEACON } from "../src/ownership.js";

const $ = (sel) => document.querySelector(sel);

beforeEach(() => {
  document.body.innerHTML = "";
});

test("attr: owns its attribute inside an app, and nothing outside one", () => {
  document.body.innerHTML = `<main sap><p id="in" attr:data-state="1" data-state="x"></p></main><p id="out" attr:data-state="1" data-state="x"></p>`;
  expect(ownsAttr($("#in"), "data-state")).toBe(true);
  expect(ownsAttr($("#in"), "data-other")).toBe(false);
  expect(ownsAttr($("#out"), "data-state")).toBe(false);
  expect(appOf($("#out"))).toBeNull();
});

test("a record declaration wins over a paint of the same attribute", () => {
  document.body.innerHTML = `<main sap><p id="p" state="data-state" attr:data-state="1"></p></main>`;
  expect(ownsAttr($("#p"), "data-state")).toBe(false);
  expect(paintsOf($("#p"))).toBeNull();
});

test("identity, class and style are never owned", () => {
  document.body.innerHTML = `<main sap><input id="i" attr:id="1" attr:data-id="1" attr:class="1" attr:style="1" attr:value="1" attr:checked="1"></main>`;
  for (const name of ["id", "data-id", "class", "style"]) expect(ownsAttr($("#i"), name)).toBe(false);
});

test("show and the show-when family own hidden", () => {
  document.body.innerHTML = `<main sap><p id="a" show="1"></p><p id="b" show-when:mode="x"></p><p id="c" option:mode="x"></p><p id="d"></p></main>`;
  expect(ownsAttr($("#a"), "hidden")).toBe(true);
  expect(ownsAttr($("#b"), "hidden")).toBe(true);
  expect(ownsAttr($("#c"), "hidden")).toBe(true);
  expect(ownsAttr($("#d"), "hidden")).toBe(false);
});

test("the error beacon is owned anywhere inside an app", () => {
  document.body.innerHTML = `<main sap><p id="a"></p></main><p id="b"></p>`;
  expect(ownsAttr($("#a"), BEACON)).toBe(true);
  expect(ownsAttr($("#b"), BEACON)).toBe(false);
});

test("text owns its children unless the element is a bound text leaf", () => {
  document.body.innerHTML = `<main sap><p id="t" text="1">x</p><p id="f" text:usd2="1">x</p><p id="b" bind="name" text="1">x</p></main>`;
  expect(paintsOf($("#t")).text).toBe(true);
  expect(paintsOf($("#f")).text).toBe(true);
  expect(paintsOf($("#b"))).toBeNull();
});

test("class: and css: own single tokens", () => {
  document.body.innerHTML = `<main sap><p id="p" class="step" class:done="1" css:pct="1"></p></main>`;
  expect(paintsOf($("#p"))).toEqual({ attrs: [], classes: ["done"], vars: ["--pct"], text: false });
});

test("inert subtrees and template content own nothing", () => {
  document.body.innerHTML = `<main sap><div sap-ignore><p id="a" attr:data-x="1"></p></div><ul items="rows"><li id="b" item template attr:data-x="1"></li></ul><template id="t"><p attr:data-x="1"></p></template></main>`;
  expect(ownsAttr($("#a"), "data-x")).toBe(false);
  expect(ownsAttr($("#b"), "data-x")).toBe(false);
  expect(ownsAttr($("#t").content.firstElementChild, "data-x")).toBe(false);
});

test("stripPaints removes painted values and keeps records and declarations", () => {
  document.body.innerHTML =
    `<main sap state="mode" mode="a"><p id="p" class="step done" class:done="1" style="color: red; --pct: 50%" css:pct="1" attr:data-state="1" data-state="ok" show="1" hidden sap-error="E24" data-n="3"><span>old</span></p><output id="o" text="1">9</output></main>`;
  const clone = document.body.cloneNode(true);
  stripPaints(clone);
  const p = clone.querySelector("#p");
  expect(p.className).toBe("step");
  expect(p.getAttribute("style")).toBe("color: red;");
  expect(p.hasAttribute("data-state")).toBe(false);
  expect(p.hasAttribute("hidden")).toBe(false);
  expect(p.hasAttribute("sap-error")).toBe(false);
  expect(p.getAttribute("data-n")).toBe("3");
  expect(p.hasAttribute("attr:data-state")).toBe(true);
  expect(clone.querySelector("#o").childNodes.length).toBe(0);
  expect(clone.querySelector("main").getAttribute("mode")).toBe("a");
  expect($("#o").textContent).toBe("9");
});

test("a class or style left empty by the strip is removed", () => {
  document.body.innerHTML = `<main sap><p id="p" class="done" class:done="1" style="--pct: 1%" css:pct="1"></p></main>`;
  const clone = document.body.cloneNode(true);
  stripPaints(clone);
  expect(clone.querySelector("#p").hasAttribute("class")).toBe(false);
  expect(clone.querySelector("#p").hasAttribute("style")).toBe(false);
});

test("an unbound form paint owns its attribute", () => {
  document.body.innerHTML = `<main sap><progress id="p" attr:value="1" value="0.5"></progress><input id="i" attr:value="1"><input id="c" type="checkbox" attr:checked="1"></main>`;
  expect(ownsAttr($("#p"), "value")).toBe(true);
  expect(paintsOf($("#p")).attrs).toEqual(["value"]);
  expect(ownsAttr($("#i"), "value")).toBe(true);
  expect(ownsAttr($("#c"), "checked")).toBe(true);
});

test("a bind, a persist, or a bound select keeps form state from the paint", () => {
  document.body.innerHTML = `<main sap><input id="b" bind="name" attr:value="1"><input id="p" type="checkbox" attr:checked="1" persist><select bind="pick"><option id="in" attr:selected="1"></option></select><select id="plain"><option id="out" attr:selected="1"></option></select></main>`;
  expect(ownsAttr($("#b"), "value")).toBe(false);
  expect(paintsOf($("#b"))).toBeNull();
  expect(ownsAttr($("#p"), "checked")).toBe(false);
  expect(ownsAttr($("#in"), "selected")).toBe(false);
  expect(ownsAttr($("#out"), "selected")).toBe(true);
});

test("stripPaints removes an unbound form paint and keeps a bound value", () => {
  document.body.innerHTML = `<main sap><progress id="p" attr:value="1" value="0.5"></progress><input id="b" bind="name" attr:value="1" value="saved"></main>`;
  const clone = document.body.cloneNode(true);
  stripPaints(clone);
  expect(clone.querySelector("#p").hasAttribute("value")).toBe(false);
  expect(clone.querySelector("#b").getAttribute("value")).toBe("saved");
  expect($("#p").getAttribute("value")).toBe("0.5");
});
