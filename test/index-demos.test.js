// The homepage's core promise: every demo is LIVE and runs the REAL shipped engine,
// no mocks. These tests load dist/sap.js (what the page's <script src> loads), mount
// each demo's own markup, and assert the behavior the prose claims — the same gate
// the page itself would pass in a browser, run here in CI.

import { extractDemos, loadEngine } from "./helpers/index-doc.js";

const demos = extractDemos();
const byId = new Map(demos.map((d) => [d.id, d]));

let Sap;

beforeAll(() => {
  Sap = loadEngine();
});

beforeEach(() => {
  Sap._reset();
  document.body.innerHTML = "";
});

function mountDemo(id) {
  const d = byId.get(id);
  if (!d) throw new Error(`no demo "${id}" on the homepage`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  host.innerHTML = d.markup;
  const roots = host.matches("[sap]") ? [host] : [...host.querySelectorAll("[sap]")];
  const recs = roots.map((r) => Sap.mount(r));
  return { host, root: roots[0], roots, recs };
}

function fire(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function setText(el, v) {
  el.value = String(v);
  fire(el);
}
function setChecked(el, v) {
  el.checked = !!v;
  fire(el);
}

describe("the homepage loads the real, shipped Sap", () => {
  test("dist/sap.js evaluates to a working Sap with the documented surface", () => {
    expect(typeof Sap).toBe("function");
    expect(typeof Sap.version).toBe("string");
    for (const m of ["mount", "refresh", "batch", "status", "report", "why", "doctor", "finalizeControlForSave"]) {
      expect(typeof Sap[m]).toBe("function");
    }
    expect(typeof Sap.formats).toBe("object");
    expect(typeof Sap.config).toBe("function");
  });

  test("the homepage ships 15 demos, each with a single [sap] root", () => {
    expect(demos.length).toBe(15);
    for (const d of demos) {
      const wrap = document.createElement("div");
      wrap.innerHTML = d.markup;
      expect(wrap.querySelectorAll("[sap]").length).toBe(1);
    }
  });
});

describe("every demo mounts GREEN on the real engine (the page's own gate)", () => {
  test.each(demos.map((d) => [d.id, d]))("demo %s: zero errors, not halted, no [sap-error] beacon", (id) => {
    const { host, recs } = mountDemo(id);
    expect(recs[0]).toBeTruthy();
    expect(Sap.report().errors.map((e) => e.code)).toEqual([]);
    expect(Sap.status().apps.every((a) => a.ok)).toBe(true);
    expect(host.querySelectorAll("[sap-error]").length).toBe(0);
  });
});

describe("Persistence — transient state never serializes into the saved file", () => {
  test("transient control values are stripped; a Sap(el) write mirrors a persisted field", async () => {
    const { root } = mountDemo("transient-savedhtml");
    const q = root.querySelector('[bind="q"]');
    const city = root.querySelector('[bind="city"]');
    const vip = root.querySelector('[bind="vip"]');
    const active = root.querySelector('[bind="active"]');

    expect(active.hasAttribute("checked")).toBe(true);
    expect(city.getAttribute("value")).toBe("Lisbon");
    expect(q.hasAttribute("value")).toBe(false);
    expect(vip.hasAttribute("checked")).toBe(false);

    setText(q, "secret query");
    setChecked(vip, true);
    await flush();
    expect(q.value).toBe("secret query"); // the live property carries it
    expect(q.hasAttribute("value")).toBe(false); // the file never does
    expect(vip.checked).toBe(true);
    expect(vip.hasAttribute("checked")).toBe(false);

    Sap(root).city = "Madrid"; // a persisted field written through code mirrors to its attr
    Sap.refresh();
    expect(city.value).toBe("Madrid");
    expect(city.getAttribute("value")).toBe("Madrid");
  });

  test("a transient filter hides rows but aggregates still count them, and it never persists", async () => {
    const { root } = mountDemo("filter");
    const total = root.querySelector('[text\\:int="sum(state.fruit, \'cal\')"]');
    expect(total.textContent).toBe("248"); // 95 + 105 + 48

    const q = root.querySelector('[bind="q"]');
    setText(q, "ap"); // matches Apple + Apricot, hides Banana
    await flush();
    const rows = [...root.querySelectorAll("[item]:not([template])")];
    const shown = rows.filter((r) => !r.hidden).map((r) => r.querySelector('[bind="name"]').textContent);
    expect(shown).toEqual(["Apple", "Apricot"]);
    expect(total.textContent).toBe("248"); // hidden rows still counted
    expect(q.hasAttribute("value")).toBe(false); // the filter never persists
  });
});

describe("Text & rich editors — a bind is plain textContent; rich editors live behind sap-ignore", () => {
  test("a contenteditable bind reads/writes the plain string only", () => {
    const { root } = mountDemo("richtext-contenteditable");
    const editable = root.querySelector('[bind="note"]');
    expect(editable.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(root.querySelector('[text="state.note"]').textContent).toBe("Clay is malleable.");

    editable.innerHTML = "<b>bold</b> and <i>italic</i>"; // a paste of formatted HTML
    fire(editable);
    Sap.refresh();
    const mirror = root.querySelector('[text="state.note"]');
    expect(mirror.textContent).toBe("bold and italic"); // flattened to plain text
    expect(mirror.innerHTML).toBe("bold and italic"); // painted as text, not HTML
  });

  test("the escape hatch: sap-ignore bodies keep markup while the list stays reactive", async () => {
    const { root } = mountDemo("richtext-embed");
    const count = () => root.querySelector("p[text]").textContent;
    const editors = () => [...root.querySelectorAll('[item]:not([template]) [sap-ignore]')];
    const bodyHtml = () => editors().map((e) => e.innerHTML).join(" ");

    for (const ed of editors()) {
      expect(ed.hasAttribute("bind")).toBe(false);
      expect(ed.hasAttribute("sap-ignore")).toBe(true);
      expect(ed.hasAttribute("no-undo")).toBe(true);
    }
    expect(bodyHtml()).toContain("<b>");
    expect(bodyHtml()).toContain("<i>");
    expect(count()).toBe("3 blocks · each body keeps its own markup");

    const formInput = root.querySelector('form [bind="kind"]');
    setText(formInput, "Quote");
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(count()).toBe("4 blocks · each body keeps its own markup");
    expect(editors().pop().innerHTML).toContain("<b>"); // markup preserved through the clone

    root.querySelector('[item]:not([template]) [move\\:down]').click();
    await flush();
    expect(count()).toBe("4 blocks · each body keeps its own markup");
    expect(bodyHtml()).toContain("<b>");

    root.querySelector('[item]:not([template]) [trigger-remove]').click();
    await flush();
    expect(count()).toBe("3 blocks · each body keeps its own markup");
    expect(Sap.report().errors).toEqual([]);
  });
});

describe("Demos gallery — the core actions behave as the prose claims", () => {
  test("two-way binding: the editable bind-matrix mounts and binds across control types", () => {
    const { root } = mountDemo("set-bindmatrix");
    expect(Sap.report().errors).toEqual([]);
    expect(root.querySelector("p.out").textContent).toBe("Ada · 36 · pro · design");
    expect(root.querySelector('select[bind="tags"][multiple]')).not.toBeNull();
    expect(root.querySelector('textarea[bind="bio"]').value).toBe("Builder.");
  });

  test("two-way binding: a live edit re-serializes select + textarea back to markup", () => {
    const { root } = mountDemo("set-bindmatrix");
    root.querySelector('select[bind="plan"]').value = "free";
    root.querySelector('input[bind="member"]').checked = false;
    root.querySelector('textarea[bind="bio"]').value = "Maker.";

    // exactly what the demo's syncBack does: clone, then finalize each control from the live one
    const clone = root.cloneNode(true);
    const liveControls = root.querySelectorAll("input, select, textarea");
    clone.querySelectorAll("input, select, textarea").forEach((c, i) => Sap.finalizeControlForSave(c, liveControls[i]));

    const planFree = [...clone.querySelector('select[bind="plan"]').options].find((o) => o.value === "free");
    expect(planFree.hasAttribute("selected")).toBe(true);
    expect(clone.querySelector('input[bind="member"]').hasAttribute("checked")).toBe(false);
    expect(clone.querySelector('textarea[bind="bio"]').textContent).toBe("Maker.");
  });

  test("set: writes a field on click; show reads it back", async () => {
    const { root } = mountDemo("tabs");
    const panels = () => [...root.querySelectorAll("p[show-when\\:tab]")].filter((p) => !p.hidden).map((p) => p.textContent.trim());
    expect(panels()).toEqual(["Sap rebuilds state from the DOM every pass."]);
    root.querySelectorAll(".pill")[1].click(); // Pricing
    await flush();
    expect(root.getAttribute("tab")).toBe("pricing");
    expect(panels()).toEqual(["Free and open source. MIT licensed."]);
  });

  test("form trigger-add clones the template row and clears the form; trigger-remove deletes", async () => {
    const { root } = mountDemo("todo");
    const open = () => root.querySelectorAll("[item]:not([template])").length;
    expect(open()).toBe(2);

    const input = root.querySelector('form [bind="title"]');
    setText(input, "Test the homepage");
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(open()).toBe(3);
    expect(input.value).toBe(""); // the form cleared
    expect([...root.querySelectorAll("[item]:not([template]) [bind='title']")].pop().textContent).toBe("Test the homepage");

    root.querySelector("[item]:not([template]) [trigger-remove]").click();
    await flush();
    expect(open()).toBe(2);
  });

  test("move:to moves a row between lists — the DOM move IS the write", async () => {
    const { root } = mountDemo("kanban");
    const count = (list) => root.querySelectorAll(`[items="${list}"] [item]:not([template])`).length;
    expect(count("todo")).toBe(2);
    expect(count("doing")).toBe(1);
    root.querySelector('[items="todo"] [item]:not([template]) [move\\:to="doing"]').click();
    await flush();
    expect(count("todo")).toBe(1);
    expect(count("doing")).toBe(2);
  });

  test("sort:FIELD reorders rows and toggles direction statelessly", async () => {
    const { root } = mountDemo("sort");
    const names = () => [...root.querySelectorAll("tbody [item]:not([template]) [bind='name']")].map((c) => c.textContent);
    expect(names()).toEqual(["Keyboard", "Monitor", "Cable"]);
    root.querySelector("[sort\\:price]").click();
    await flush();
    expect(names()).toEqual(["Cable", "Keyboard", "Monitor"]); // 12, 89, 340 asc
    root.querySelector("[sort\\:price]").click();
    await flush();
    expect(names()).toEqual(["Monitor", "Keyboard", "Cable"]); // desc
  });
});

describe("Detail lens — projects a row into any container, including a native <dialog>", () => {
  test("one selection fills both an inline <div> and a native <dialog>; edits route back", async () => {
    const { root } = mountDemo("modal-dialog");
    const dlg = root.querySelector("dialog#peopleDlg");
    const inlineDiv = root.querySelector("div[detail]");
    expect(dlg).toBeTruthy();
    expect(dlg.tagName).toBe("DIALOG"); // a plain native dialog — sap has no modal API
    expect(inlineDiv.getAttribute("detail")).toBe("people by state.selected");

    expect(dlg.hidden).toBe(true);
    expect(inlineDiv.hidden).toBe(true);

    Sap(root).selected = "person-grace"; // what a row click writes
    Sap.refresh();

    expect(dlg.hidden).toBe(false);
    expect(dlg.querySelector('input[bind="name"]').value).toBe("Grace Hopper");
    expect(dlg.querySelector('input[bind="email"]').value).toBe("grace@navy.mil");
    expect(inlineDiv.querySelector('input[bind="name"]').value).toBe("Grace Hopper");

    setText(dlg.querySelector('input[bind="name"]'), "Grace M. Hopper"); // edit in the dialog
    await flush();
    expect(root.querySelector('#person-grace [bind="name"]').textContent).toBe("Grace M. Hopper");

    Sap.refresh();
    expect(inlineDiv.querySelector('input[bind="name"]').value).toBe("Grace M. Hopper");

    Sap(root).selected = "person-alan";
    Sap.refresh();
    expect(dlg.querySelector('input[bind="name"]').value).toBe("Alan Turing");
  });
});
