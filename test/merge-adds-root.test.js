// A merge can add a [sap] root while every old root stays connected. The host's
// derived repaint is the only signal sapjs gets, and it must mount the new root.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const code = readFileSync(join(__dirname, "..", "dist", "sap.js"), "utf8");

let repaints = [];

beforeEach(() => {
  repaints = [];
  delete window.Sap;
  window.clay = {
    derived: {
      register: (fn) => { repaints.push(fn); return () => repaints.splice(repaints.indexOf(fn), 1); },
    },
  };
  document.body.innerHTML = `<main sap><output id="one" text="'one'"></output></main>`;
});

afterEach(() => {
  if (window.Sap && typeof window.Sap.unmount === "function") window.Sap.unmount();
  delete window.clay;
  delete window.Sap;
});

test("a root a merge adds is mounted by the derived repaint", () => {
  new Function(code)();
  expect(document.querySelector("#one").textContent).toBe("one");
  expect(window.Sap.status().apps).toHaveLength(1);

  const section = document.createElement("section");
  section.setAttribute("sap", "");
  section.innerHTML = `<output text="'two'"></output>`;
  document.body.append(section);

  repaints[0]();

  expect(section.querySelector("output").textContent).toBe("two");
  expect(window.Sap.status().apps).toHaveLength(2);
});
