import { mount, type, Sap } from "./helpers/mount.js";

// Browser order: close() removes open at once and fires the close event later.
let queued = [];
beforeAll(() => {
  const P = window.HTMLDialogElement.prototype;
  P.showModal = function () { this.setAttribute("open", ""); };
  P.close = function () {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    queued.push(this);
  };
});
beforeEach(() => { queued = []; });
const deliver = () => { const q = queued; queued = []; q.forEach((d) => d.dispatchEvent(new Event("close"))); };

const CARDS = `
  <section items="cards">
    <article item data-id="a"><span bind="title">A</span></article>
    <article item data-id="b"><span bind="title">B</span></article>
  </section>`;
const warns = () => Sap.report().warnings.map((w) => w.code);

describe("dialog lifecycle", () => {
  test("a user close is not undone by the pass that its attribute removal triggers", async () => {
    const root = mount(`<main sap state="sel:transient">${CARDS}<div clay="freeze"><dialog detail="cards by state.sel"><input id="t" bind="title"></dialog></div><input id="other" bind="note"></main>`);
    const dlg = root.querySelector("dialog");
    Sap(root).sel = "a";
    await flush();
    expect(dlg.open).toBe(true);
    dlg.close();
    await flush();
    Sap.refresh();
    expect(dlg.open).toBe(false);
    deliver();
    await flush();
    expect(Sap(root).sel).toBe("");
    Sap(root).sel = "a";
    await flush();
    expect(dlg.open).toBe(true);
  });

  test("a dialog keyed by an expression can be dismissed, and reopens when the key changes", async () => {
    const root = mount(`<main sap state="sel">${CARDS}<div clay="freeze"><dialog detail="cards by state.sel || ''"><input id="t" bind="title"></dialog></div><input id="other" bind="note"></main>`);
    const dlg = root.querySelector("dialog");
    Sap(root).sel = "a";
    await flush();
    expect(dlg.open).toBe(true);
    dlg.close();
    deliver();
    await flush();
    type(root.querySelector("#other"), "x");
    await flush();
    Sap.refresh();
    expect(dlg.open).toBe(false);
    expect(Sap(root).sel).toBe("a");
    Sap(root).sel = "b";
    await flush();
    expect(dlg.open).toBe(true);
    expect(root.querySelector("#t").value).toBe("B");
  });

  test("a late close event from the engine's own close does not clear a newer selection", async () => {
    const root = mount(`<main sap state="sel">${CARDS}<div clay="freeze"><dialog detail="cards by state.sel"></dialog></div></main>`);
    const dlg = root.querySelector("dialog");
    Sap(root).sel = "a";
    Sap.refresh();
    Sap(root).sel = "";
    Sap.refresh();
    expect(dlg.open).toBe(false);
    Sap(root).sel = "b";
    Sap.refresh();
    expect(dlg.open).toBe(true);
    deliver();
    await flush();
    expect(Sap(root).sel).toBe("b");
    expect(dlg.open).toBe(true);
  });

  test("a key declared on the dialog itself is cleared there, with no new parent field", async () => {
    const root = mount(`<main sap>${CARDS}<div clay="freeze"><dialog state="selected" selected="a" detail="cards by state.selected"></dialog></div></main>`);
    const dlg = root.querySelector("dialog");
    expect(dlg.open).toBe(true);
    dlg.close();
    deliver();
    await flush();
    expect(dlg.getAttribute("selected")).toBe("");
    expect(root.hasAttribute("selected")).toBe(false);
    expect(root.getAttribute("state") || "").not.toContain("selected");
    expect(dlg.open).toBe(false);
  });

  test("a dialog saved with hidden becomes visible when it opens", async () => {
    const root = mount(`<main sap state="sel">${CARDS}<div clay="freeze"><dialog hidden detail="cards by state.sel"></dialog></div></main>`);
    const dlg = root.querySelector("dialog");
    Sap(root).sel = "a";
    await flush();
    expect(dlg.open).toBe(true);
    expect(dlg.hidden).toBe(false);
  });
});

describe("W31", () => {
  test("only a freeze ancestor silences it", () => {
    mount(`<main sap state="sel">${CARDS}<div clay="editor-ui"><dialog detail="cards by state.sel"></dialog></div></main>`);
    expect(warns()).toContain("W31");
    mount(`<main sap state="sel">${CARDS}<dialog clay="freeze" detail="cards by state.sel"></dialog></main>`);
    expect(warns()).toContain("W31");
    mount(`<main sap state="sel">${CARDS}<div clay="freeze"><dialog detail="cards by state.sel"></dialog></div></main>`);
    expect(warns()).not.toContain("W31");
  });
});
