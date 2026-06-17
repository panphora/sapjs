// The doc's core promise: every demo is LIVE and runs the REAL sapjs engine
// inlined into the file — no mocks. These tests evaluate the exact inlined engine
// (what the browser's <script> tag runs), then mount each demo's own markup and
// assert the behavior the prose claims. This is the page's own verification gate,
// run in CI.

import { extractDemos, loadInlinedEngine } from "./helpers/doc.js";

const demos = extractDemos();
const byId = new Map(demos.map((d) => [d.id, d]));

let Sap;

beforeAll(() => {
  Sap = loadInlinedEngine();
});

beforeEach(() => {
  Sap._reset();
  document.body.innerHTML = "";
});

function mountDemo(id) {
  const d = byId.get(id);
  if (!d) throw new Error(`no demo "${id}" in the doc`);
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

describe("the inlined engine is the real, shipped Sap", () => {
  test("evaluating the inlined <script> yields a working Sap", () => {
    expect(typeof Sap).toBe("function");
    expect(Sap.version).toBe("0.2.0");
    expect(typeof Sap.mount).toBe("function");
    expect(typeof Sap.refresh).toBe("function");
  });

  test("the engine surface matches what the doc claims it has — and lacks", () => {
    // §0 honesty note: the shipped build mounts [sap] only and has NO Sap.app
    expect(Sap.app).toBeUndefined();
    // §3: custom formats are the one real extension point
    expect(typeof Sap.formats).toBe("object");
    expect(typeof Sap.config).toBe("function");
    // the overview "API surface" table
    for (const m of ["refresh", "batch", "status", "report", "why", "doctor", "mount"]) {
      expect(typeof Sap[m]).toBe("function");
    }
  });

  test("the doc ships 14 demos, each with a single [sap] root", () => {
    expect(demos.length).toBe(14);
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
    // public twins, exactly what the page's Verify panel reads
    expect(Sap.report().errors.map((e) => e.code)).toEqual([]);
    expect(Sap.status().apps.every((a) => a.ok)).toBe(true);
    expect(host.querySelectorAll("[sap-error]").length).toBe(0);
  });
});

describe("Q1 — transient state never serializes into the saved file", () => {
  test("control transient: live value drives the app, value/checked attrs are stripped", async () => {
    const { root } = mountDemo("transient-savedhtml");
    const q = root.querySelector('[bind="q"]'); // search, transient
    const city = root.querySelector('[bind="city"]'); // persisted, authored value
    const vip = root.querySelector('[bind="vip"]'); // checkbox, transient
    const active = root.querySelector('[bind="active"]'); // checkbox, persisted, checked

    // baseline: persisted controls carry serializable attributes; transient ones don't
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

    // a persisted field written through Sap(el) mirrors to its attribute (it saves)
    Sap(root).city = "Madrid";
    Sap.refresh();
    expect(city.value).toBe("Madrid");
    expect(city.getAttribute("value")).toBe("Madrid");
  });

  test("declared transient: state lives on the runtime expando, never as an attribute", () => {
    const { root } = mountDemo("transient-declared");
    expect(root.getAttribute("state")).toContain("secret:transient"); // declaration stays
    expect(root.hasAttribute("secret")).toBe(false); // value never written as an attr

    const secretEl = root.querySelector('[text="state.secret"]');
    const lenEl = root.querySelector('[text="state.len"]');
    expect(secretEl.textContent).toBe("hunter2");
    expect(lenEl.textContent).toBe("7");

    Sap(root).secret = "swordfish";
    Sap.refresh();
    expect(secretEl.textContent).toBe("swordfish");
    expect(lenEl.textContent).toBe("9");
    expect(root.hasAttribute("secret")).toBe(false);
    expect(root._sapTransient.secret).toBe("swordfish"); // the runtime store, not the DOM
  });

  test("transient filter: a transient search hides rows but aggregates still see them", async () => {
    const { root } = mountDemo("transient-filter");
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

describe("Q2 — rich text: a bind is plain textContent (no HTML-valued state)", () => {
  test("a contenteditable bind reads/writes the plain string only", () => {
    const { root } = mountDemo("richtext-contenteditable");
    const editable = root.querySelector('[bind="note"]');
    expect(editable.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(root.querySelector('[text="state.note"]').textContent).toBe("Clay is malleable.");

    // simulate a paste of formatted HTML: the carrier reads textContent, dropping markup
    editable.innerHTML = "<b>bold</b> and <i>italic</i>";
    fire(editable);
    Sap.refresh();
    const mirror = root.querySelector('[text="state.note"]');
    expect(mirror.textContent).toBe("bold and italic"); // flattened to plain text
    expect(mirror.innerHTML).toBe("bold and italic"); // painted as text, not HTML
  });
});

describe("Q3 — extending: custom formats are the one real extension point", () => {
  test("a registered Sap.formats.x / Sap.config format actually paints", async () => {
    const { root } = mountDemo("extending-format");
    const eur = root.querySelector("[text\\:eur]"); // custom, Sap.formats.eur
    const usd2 = root.querySelector("[text\\:usd2]"); // built-in
    const gbp = root.querySelector("[text\\:gbp]"); // custom, Sap.config({formats})
    expect(eur.textContent).toBe("€42.50");
    expect(usd2.textContent).toBe("$42.50");
    expect(gbp.textContent).toBe("£42.50");

    setText(root.querySelector('[bind="price"]'), "100");
    await flush();
    expect(eur.textContent).toBe("€100.00");
    expect(gbp.textContent).toBe("£100.00");
    expect(usd2.textContent).toBe("$100.00");
  });

  test("an unregistered format would fail loud (E22) — proving the registry is the gate", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = `<main sap><input type="number" bind="n" value="5"><b text:zzz="state.n"></b></main>`;
    Sap.mount(host.querySelector("[sap]"));
    const codes = Sap.report().errors.map((e) => e.code);
    expect(codes).toContain("E22");
  });
});

describe("Q4 — setting state: the deliberate write surfaces all funnel through one pass", () => {
  test("set: writes a field on click; show reads it back", async () => {
    const { root } = mountDemo("set-tabs");
    const panels = () => [...root.querySelectorAll("p[show]")].filter((p) => !p.hidden).map((p) => p.textContent.trim());
    // the default ("tab=overview") seeds state without writing an attribute yet
    expect(panels()).toEqual(["Sap rebuilds state from the DOM every pass."]);
    root.querySelectorAll(".pill")[1].click(); // Pricing
    await flush();
    expect(root.getAttribute("tab")).toBe("pricing"); // the click wrote it through
    expect(panels()).toEqual(["Free and open source. MIT licensed."]);
  });

  test("form trigger-add clones the template row and clears the form; trigger-remove deletes", async () => {
    const { root } = mountDemo("set-triggeradd");
    const open = () => root.querySelectorAll("[item]:not([template])").length;
    expect(open()).toBe(2);

    const input = root.querySelector('form [bind="title"]');
    setText(input, "Test the explainer");
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(open()).toBe(3);
    expect(input.value).toBe(""); // the form cleared
    const last = [...root.querySelectorAll("[item]:not([template]) [bind='title']")].pop();
    expect(last.textContent).toBe("Test the explainer");

    root.querySelector("[item]:not([template]) [trigger-remove]").click();
    await flush();
    expect(open()).toBe(2);
  });

  test("the editable bind-matrix demo's initial markup mounts and binds across control types", () => {
    const { root } = mountDemo("set-bindmatrix");
    expect(Sap.report().errors).toEqual([]);
    const out = root.querySelector("p.out");
    expect(out.textContent).toBe("Ada · 36 · pro");
  });

  test("move:to moves a row between lists — the DOM move IS the write", async () => {
    const { root } = mountDemo("set-kanban");
    const count = (list) => root.querySelectorAll(`[items="${list}"] [item]:not([template])`).length;
    expect(count("todo")).toBe(2);
    expect(count("doing")).toBe(1);
    root.querySelector('[items="todo"] [item]:not([template]) [move\\:to="doing"]').click();
    await flush();
    expect(count("todo")).toBe(1);
    expect(count("doing")).toBe(2);
  });

  test("sort:FIELD reorders rows and toggles direction statelessly", async () => {
    const { root } = mountDemo("set-sort");
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

describe("Q5 — modals: the detail lens projects into ANY container, including a native <dialog>", () => {
  test("one selection fills both an inline <div> and a native <dialog>; edits route back", async () => {
    const { root } = mountDemo("modal-dialog");
    const dlg = root.querySelector("dialog#peopleDlg");
    const inlineDiv = root.querySelector("div[detail]");
    expect(dlg).toBeTruthy();
    expect(dlg.tagName).toBe("DIALOG"); // a plain native dialog — sap has no modal API
    expect(inlineDiv.getAttribute("detail")).toBe("people by state.selected");

    // nothing selected at mount -> both lenses hidden
    expect(dlg.hidden).toBe(true);
    expect(inlineDiv.hidden).toBe(true);

    // selecting a row is just writing its $key (the row id) — what the row click does
    Sap(root).selected = "person-grace";
    Sap.refresh();

    expect(dlg.hidden).toBe(false);
    expect(dlg.querySelector('input[bind="name"]').value).toBe("Grace Hopper");
    expect(dlg.querySelector('input[bind="email"]').value).toBe("grace@navy.mil");
    expect(inlineDiv.querySelector('input[bind="name"]').value).toBe("Grace Hopper");

    // edit inside the native dialog -> writes through to the source row
    setText(dlg.querySelector('input[bind="name"]'), "Grace M. Hopper");
    await flush();
    expect(root.querySelector('#person-grace [bind="name"]').textContent).toBe("Grace M. Hopper");

    // the other lens reflects the same source row on the next pass
    Sap.refresh();
    expect(inlineDiv.querySelector('input[bind="name"]').value).toBe("Grace M. Hopper");

    // switching selection re-projects the other row
    Sap(root).selected = "person-alan";
    Sap.refresh();
    expect(dlg.querySelector('input[bind="name"]').value).toBe("Alan Turing");
  });
});
