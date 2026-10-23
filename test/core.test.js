import { readFileSync } from "node:fs";
import { join } from "node:path";
import Sap from "../src/core.js";

const dist = (name) => readFileSync(join(__dirname, "..", "dist", name), "utf8");

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

test("Sap.why() names full sapjs, and a foreign-dialect attribute is not the core's error", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  expect(Sap.why(document.body)).toBeNull();
  expect(warn).toHaveBeenCalledWith("Sap.why is full sapjs; load https://clayjs.com/v1/sap.js");
  document.body.innerHTML = `<main sap state="x"><div v-if="state.x">x</div></main>`;
  const app = Sap.mount(document.querySelector("[sap]"));
  expect(app.halted).toBeFalsy();
  expect(app.diag.errors.map((e) => e.code)).not.toContain("E01");
});

test("the core bundle does not overwrite window.Sap when a classic script runs it", () => {
  document.body.innerHTML = `<main sap><output text="'hi'"></output></main>`;
  delete window.Sap;
  window.eval(dist("sap-core.js"));
  expect(typeof window.Sap).toBe("function");
  expect(window.Sap.core).toBe(true);
  expect(typeof window.Sap.refresh).toBe("function");
  expect(document.querySelector("output").textContent).toBe("hi");
});

test("the core bundle leaves the full sapjs window.Sap in place", () => {
  document.body.innerHTML = `<main sap><output text="'hi'"></output></main>`;
  delete window.Sap;
  window.eval(dist("sap.js"));
  const full = window.Sap;
  const refresh = full.refresh;
  window.eval(dist("sap-core.js"));
  expect(window.Sap).toBe(full);
  expect(window.Sap.core).toBeFalsy();
  expect(window.Sap.refresh).toBe(refresh);
  expect(document.querySelector("output").textContent).toBe("hi");
});

test("a core app halted at mount runs no pass on refresh", () => {
  document.body.innerHTML = `<main sap state="x" x="1"><button set:x="2">go</button><p text="state.x">stale</p></main>`;
  const app = Sap.mount(document.querySelector("[sap]"));
  expect(app.halted).toBe(true);
  const p = document.querySelector("p");
  expect(p.textContent).toBe("stale");
  Sap.refresh();
  expect(p.textContent).toBe("stale");
  expect(app.diag.errors.map((e) => e.code)).toContain("E50");
  expect(Sap.status().apps[0].passes).toBe(0);
});

test("full-only markup added after mount halts the core app", () => {
  document.body.innerHTML = `<main sap state="x" x="1"><p text="state.x">1</p></main>`;
  const app = Sap.mount(document.querySelector("[sap]"));
  expect(app.halted).toBeFalsy();
  const btn = document.createElement("button");
  btn.setAttribute("set:x", "2");
  document.querySelector("main").append(btn);
  Sap.refresh();
  expect(app.halted).toBe(true);
  const e50 = app.diag.errors.find((e) => e.code === "E50");
  expect(e50).toBeTruthy();
  expect(e50.attr).toBe("set:x");
  expect(btn.getAttribute("sap-error")).toBe("E50");
});

test("a pass that meets full-only markup writes nothing", () => {
  document.body.innerHTML = `<main sap state="x" x="saved"><p text="state.x">saved</p></main>`;
  const app = Sap.mount(document.querySelector("[sap]"));
  expect(app.halted).toBeFalsy();
  const p = document.querySelector("p");
  expect(p.textContent).toBe("saved");
  document.querySelector("main").setAttribute("x", "changed");
  const out = document.createElement("output");
  out.setAttribute("calc:y", "1");
  document.querySelector("main").append(out);
  Sap.refresh();
  expect(app.diag.errors.map((e) => e.code)).toContain("E50");
  expect(p.textContent).toBe("saved");
});
