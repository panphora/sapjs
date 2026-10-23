import Sap from "../src/core.js";

const quiet = () => { jest.spyOn(console, "log").mockImplementation(() => {}); jest.spyOn(console, "error").mockImplementation(() => {}); jest.spyOn(console, "warn").mockImplementation(() => {}); };
beforeEach(() => { Sap._reset(); document.body.innerHTML = ""; quiet(); });

test("core paints declared records", () => {
  document.body.innerHTML = `<main sap><ul items="rows"><li item data-id="a" state="data-qty:num" data-qty="2"></li><li item data-id="b" state="data-qty:num" data-qty="3"></li></ul><output text="sum(state.rows, 'qty')">0</output><p attr:data-state="sum(state.rows, 'qty') > 4 ? 'big' : 'small'" class:big="sum(state.rows, 'qty') > 4" css:n="sum(state.rows, 'qty')" show="state.rows.length > 1">x</p></main>`;
  const app = Sap.mount(document.querySelector("[sap]"));
  expect(app.halted).toBeFalsy();
  expect(document.querySelector("output").textContent).toBe("5");
  const p = document.querySelector("p");
  expect(p.dataset.state).toBe("big");
  expect(p.classList.contains("big")).toBe(true);
  expect(p.style.getPropertyValue("--n")).toBe("5");
  expect(p.hidden).toBe(false);
  document.querySelector("[data-id=b]").setAttribute("data-qty", "1");
  Sap.refresh();
  expect(document.querySelector("output").textContent).toBe("3");
  expect(p.dataset.state).toBe("small");
});

test.each([
  ['<output calc:t="1" text="state.t"></output>', "calc:t"],
  ['<ul each="state.rows"><template><li></li></template></ul>', "each"],
  ['<button set:x="1">go</button>', "set:x"],
  ['<form trigger-add="rows"></form>', "trigger-add"],
  ['<div effect="1"></div>', "effect"],
])("core halts on full-sapjs markup %s", (html, attr) => {
  document.body.innerHTML = `<main sap state="x">${html}</main>`;
  const app = Sap.mount(document.querySelector("[sap]"));
  expect(app.halted).toBe(true);
  expect(app.diag.errors[0].code).toBe("E50");
  expect(app.diag.errors[0].attr).toBe(attr);
});

test("full-sapjs markup added after mount is flagged, not ignored", () => {
  document.body.innerHTML = `<main sap state="x" x="1"><p text="state.x">1</p></main>`;
  const app = Sap.mount(document.querySelector("[sap]"));
  const ul = document.createElement("ul");
  ul.setAttribute("each", "[]");
  ul.innerHTML = "<template><li></li></template>";
  document.querySelector("main").append(ul);
  Sap.refresh();
  expect(app.diag.errors.map((e) => e.code)).toContain("E50");
  expect(ul.getAttribute("sap-error")).toBe("E50");
});

test("Sap(el) names full sapjs", () => {
  expect(() => Sap(document.body)).toThrow(/full sapjs/);
});
