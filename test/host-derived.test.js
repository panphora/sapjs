// A host that treats paints as derived (ClayJS's clay.derived) repaints them itself:
// sapjs hands it a repaint hook instead of listening for the merge event, says when
// its first pass is done, and does not warn W30 for a stale paint it heals.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const code = readFileSync(join(__dirname, "..", "dist", "sap.js"), "utf8");

function fakeHost() {
  const host = { repaints: [], mounted: 0, applied: 0 };
  window.clay = {
    derived: {
      register: (fn) => {
        host.repaints.push(fn);
        return () => host.repaints.splice(host.repaints.indexOf(fn), 1);
      },
      mounted: () => { host.mounted++; },
    },
  };
  return host;
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  delete window.Sap;
  delete window.clay;
  document.body.innerHTML = `<main sap><ul items="rows"><li item data-id="a" state="data-qty:num" data-qty="2"></li></ul><output text="sum(state.rows, 'qty')">0</output></main>`;
});

test("registers a repaint hook, announces its first pass, and skips W30", () => {
  const host = fakeHost();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  new Function(code)();
  expect(host.repaints).toHaveLength(1);
  expect(host.mounted).toBe(1);
  expect(document.querySelector("output").textContent).toBe("2");
  expect(warn.mock.calls.some((c) => String(c[0]).includes("W30"))).toBe(false);
  document.querySelector("[data-id=a]").setAttribute("data-qty", "5");
  host.repaints[0]();
  expect(document.querySelector("output").textContent).toBe("5");
});

test("a host without the hook still gets the merge-event refresh", () => {
  window.clay = {};
  new Function(code)();
  document.querySelector("[data-id=a]").setAttribute("data-qty", "6");
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: {} }));
  expect(document.querySelector("output").textContent).toBe("6");
});

test("unmount unregisters and stops mounting", () => {
  const host = fakeHost();
  new Function(code)();
  window.Sap.unmount();
  expect(host.repaints).toHaveLength(0);
  expect(window.Sap._registry.size).toBe(0);
  expect(window.Sap.mount(document.querySelector("main"))).toBeNull();
});
