import { mount, Sap } from "./helpers/mount.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

const APP = `
  <main sap>
    <div items="rows">
      <div class="row" item cms-template data-id=""><input bind="amount" value=""></div>
      <div class="row" item template data-id=""><input bind="amount" value=""></div>
      <div class="row" item data-id="a"><input bind="amount" value="5"></div>
      <div class="row" item data-id="b"><input bind="amount" value="7"></div>
      <button id="add" trigger-add="rows">+</button>
    </div>
    <output id="n" text="state.rows.length"></output>
    <output id="sum" text="state.rows.reduce((s, r) => s + Number(r.amount || 0), 0)"></output>
  </main>`;

const records = (root) =>
  [...root.querySelectorAll('[items="rows"] > [item]:not([template]):not([cms-template])')];

test("a cms-template seed row is not a record", async () => {
  const root = mount(APP);
  await flush();
  expect(root.querySelector("#n").textContent).toBe("2");
  expect(root.querySelector("#sum").textContent).toBe("12");
  expect(Sap.report().errors).toEqual([]);
});

test("trigger-add clones the blueprint, not the seed", async () => {
  const root = mount(APP);
  await flush();
  root.querySelector("#add").click();
  await flush();
  const added = records(root).pop();
  expect(root.querySelector("#n").textContent).toBe("3");
  expect(added.hasAttribute("cms-template")).toBe(false);
  expect(added.getAttribute("data-id")).toBeTruthy();
});

test("typing into the seed changes no total", async () => {
  const root = mount(APP);
  await flush();
  const input = root.querySelector("[cms-template] input");
  input.value = "100";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
  expect(root.querySelector("#sum").textContent).toBe("12");
});

test("removing every record keeps the seed", async () => {
  const root = mount(APP);
  await flush();
  const sap = Sap(root.querySelector("[sap]") || root);
  [...sap.rows].forEach((row) => row.$remove());
  await flush();
  expect(root.querySelector("#n").textContent).toBe("0");
  expect(root.querySelector("[cms-template]")).not.toBeNull();
  expect(Sap.report().errors).toEqual([]);
});
