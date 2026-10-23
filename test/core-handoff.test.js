// The two builds on one page, the way a browser runs them: the core first (ClayJS's
// derive plugin), then full sapjs from its own script tag. Full sapjs takes the page
// over, and exactly one engine paints.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const dist = (name) => readFileSync(join(__dirname, "..", "dist", name), "utf8");
const run = (code) => new Function(code)();

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  delete window.Sap;
  delete window.clay;
  document.body.innerHTML = `<main sap><ul items="rows"><li item data-id="a" state="data-qty:num" data-qty="2"></li></ul><output text="sum(state.rows, 'qty')">0</output></main>`;
});

test("the core mounts alone and marks itself", () => {
  run(dist("sap-core.js"));
  expect(window.Sap.core).toBe(true);
  expect(window.Sap._registry.size).toBe(1);
  expect(document.querySelector("output").textContent).toBe("2");
});

test("full sapjs takes over from the core, with one engine left", () => {
  run(dist("sap-core.js"));
  const core = window.Sap;
  run(dist("sap.js"));
  const full = window.Sap;
  expect(full).not.toBe(core);
  expect(full.core).toBeUndefined();
  expect(core._registry.size).toBe(0);
  expect(full._registry.size).toBe(1);
  expect(core.mount(document.querySelector("main"))).toBeNull();
  document.querySelector("[data-id=a]").setAttribute("data-qty", "7");
  full.refresh();
  expect(document.querySelector("output").textContent).toBe("7");
});

test("the core leaves a page that already has full sapjs alone", () => {
  const engines = [];
  window.clay = { derived: { register: (fn) => { engines.push(fn); return () => {}; } } };
  run(dist("sap.js"));
  const full = window.Sap;
  run(dist("sap-core.js"));
  expect(window.Sap).toBe(full);
  expect(engines).toHaveLength(1);
});

test("a host that treats paints as derived gets a repaint hook and no W30", () => {
  const repaints = [];
  let mounted = 0;
  window.clay = { derived: { register: (fn) => { repaints.push(fn); return () => repaints.splice(repaints.indexOf(fn), 1); }, mounted: () => { mounted++; } } };
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  run(dist("sap-core.js"));
  expect(repaints).toHaveLength(1);
  expect(mounted).toBe(1);
  expect(warn.mock.calls.some((c) => String(c[0]).includes("W30"))).toBe(false);
  document.querySelector("[data-id=a]").setAttribute("data-qty", "4");
  repaints[0]();
  expect(document.querySelector("output").textContent).toBe("4");
  window.Sap.unmount();
  expect(repaints).toHaveLength(0);
});
