// Every worked app in guide.md (a ```html app=NAME block) is mounted against the
// engine and checked for the behavior its prose claims.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mount, type, Sap } from "./helpers/mount.js";

const guide = readFileSync(join(__dirname, "..", "guide.md"), "utf8");
const apps = Object.fromEntries([...guide.matchAll(/```html app=(\w+)\n([\s\S]*?)```/g)].map((m) => [m[1], m[2]]));

beforeAll(() => {
  const P = window.HTMLDialogElement.prototype;
  P.showModal = function () { this.setAttribute("open", ""); };
  P.close = function () {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  window.confirm = () => true;
});

function mountClean(name) {
  const root = mount(apps[name]);
  const status = Sap.status();
  expect(Sap.report().errors).toEqual([]);
  expect(Sap.report().warnings).toEqual([]);
  expect(status.ok).toBe(true);
  expect(status.apps[0].mountWrites).toBe(0);
  for (const panel of root.querySelectorAll("[detail]")) {
    expect(panel.parentElement.closest('[clay="freeze"]')).not.toBeNull();
  }
  return root;
}
const submit = (form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const rows = (root, sel) => [...root.querySelectorAll(sel)].filter((r) => !r.hasAttribute("template"));

test("the guide has exactly the three worked apps", () => {
  expect(Object.keys(apps)).toEqual(["tracker", "kanban", "notes"]);
});

describe("9.1 expense tracker", () => {
  test("mounts clean, recomputes totals, adds through the composer and removes", async () => {
    const root = mountClean("tracker");
    const total = root.querySelector("#total");
    const food = root.querySelector("#food");

    type(root.querySelector('[data-id="e-groc"] input[type=number]'), 54.5);
    await flush();
    Sap.refresh();
    expect(total.textContent).toBe("$66.50");
    expect(food.textContent).toBe("$54.50");
    expect(root.querySelector('[data-id="e-groc"] input[type=number]').getAttribute("value")).toBe("54.5");

    const form = root.querySelector("form");
    const what = form.querySelector('[bind="what"]');
    type(what, "Coffee");
    type(form.querySelector('[bind="amount"]'), 3);
    form.querySelector("select").value = "food";
    submit(form);
    await flush();
    Sap.refresh();
    const added = rows(root, "tbody > tr[item]");
    expect(added).toHaveLength(3);
    const last = added[2];
    expect(last.getAttribute("data-category")).toBe("food");
    expect(last.querySelector('[bind="what"]').value).toBe("Coffee");
    expect(last.getAttribute("data-id")).not.toBe("");
    expect(total.textContent).toBe("$69.50");
    expect(food.textContent).toBe("$57.50");
    expect(what.value).toBe("");
    expect(document.activeElement).toBe(what);
    expect(form.querySelector("select").value).toBe("food");

    root.querySelector('[data-id="e-train"] [trigger-remove]').click();
    await flush();
    Sap.refresh();
    expect(root.querySelector('[data-id="e-train"]')).toBeNull();
    expect(total.textContent).toBe("$57.50");
  });
});

describe("9.2 Kanban board", () => {
  test("mounts clean; a card click opens its editor, which edits the card and its checklist", async () => {
    const root = mountClean("kanban");
    const card = root.querySelector('[data-id="c-brief"]');
    const dlg = root.querySelector("dialog");
    expect(card.querySelector("small").textContent).toBe("1/2");

    card.click();
    await flush();
    Sap.refresh();
    expect(dlg.open).toBe(true);
    const title = dlg.querySelector("input.title");
    expect(title.value).toBe("Write the brief");

    type(title, "Write the launch brief");
    await flush();
    Sap.refresh();
    expect(card.getAttribute("data-title")).toBe("Write the launch brief");
    expect(card.querySelector("span").textContent).toBe("Write the launch brief");

    const boxes = dlg.querySelectorAll('ul input[type="checkbox"]');
    expect([...boxes].map((b) => b.checked)).toEqual([true, false]);
    type(boxes[1], true);
    await flush();
    Sap.refresh();
    expect(root.querySelector('[data-id="k-draft"]').hasAttribute("data-done")).toBe(true);
    expect(card.querySelector("small").textContent).toBe("2/2");

    const label = dlg.querySelector("ul input.label");
    expect(label.value).toBe("Outline");

    const newCheck = dlg.querySelector("input.new-check");
    type(newCheck, "Ship it");
    submit(newCheck.form);
    await flush();
    Sap.refresh();
    const checks = card.querySelectorAll(".checks > li[item]");
    expect(checks).toHaveLength(3);
    expect(checks[2].getAttribute("data-label")).toBe("Ship it");
    expect(checks[2].getAttribute("data-id")).not.toBe("");
    expect(dlg.querySelectorAll("ul input.label")).toHaveLength(3);
    expect(card.querySelector("small").textContent).toBe("2/3");

    dlg.close();
    await flush();
    Sap.refresh();
    expect(Sap(root).open).toBe("");
    expect(dlg.open).toBe(false);
  });

  test("an empty list adds a card from the shared blueprint", async () => {
    const root = mountClean("kanban");
    const done = root.querySelector('[data-id="l-done"]');
    done.querySelector(".add-card").click();
    await flush();
    Sap.refresh();
    const card = done.querySelector("ol > li[item]");
    expect(card).not.toBeNull();
    expect(card.getAttribute("data-title")).toBe("New card");
    expect(card.getAttribute("data-id")).not.toBe("");
    expect(card.querySelector("small").textContent).toBe("0/0");
  });
});

describe("9.3 notes", () => {
  test("mounts clean; search filters the sorted view; the editor edits, creates and deletes", async () => {
    const root = mountClean("notes");
    const titles = () => [...root.querySelectorAll("#list > a")].map((a) => a.textContent);
    const editor = root.querySelector("#editor");
    expect(titles()).toEqual(["Books", "Ideas"]);
    expect(editor.hidden).toBe(true);

    type(root.querySelector("#q"), "recipe");
    await flush();
    Sap.refresh();
    expect(titles()).toEqual(["Ideas"]);
    type(root.querySelector("#q"), "");
    await flush();
    Sap.refresh();

    root.querySelector("#list > a:last-of-type").click();
    await flush();
    Sap.refresh();
    expect(editor.hidden).toBe(false);
    expect(editor.querySelector("input").value).toBe("Ideas");
    type(editor.querySelector("textarea"), "A board for recipes and wines");
    await flush();
    Sap.refresh();
    expect(root.querySelector('[data-id="n-ideas"] [bind="body"]').textContent).toBe("A board for recipes and wines");

    root.querySelector("#new").click();
    await flush();
    Sap.refresh();
    expect(titles()).toEqual(["Books", "Ideas", "Untitled"]);
    expect(editor.querySelector("input").value).toBe("Untitled");
    type(editor.querySelector("input"), "Zebra facts");
    await flush();
    Sap.refresh();
    expect(titles()).toEqual(["Books", "Ideas", "Zebra facts"]);

    editor.querySelector("[trigger-remove]").click();
    await flush();
    Sap.refresh();
    expect(titles()).toEqual(["Books", "Ideas"]);
    expect(editor.hidden).toBe(true);
  });
});
