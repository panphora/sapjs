import { mount, Sap } from "./helpers/mount.js";

beforeAll(() => {
  const P = window.HTMLDialogElement.prototype;
  P.showModal = function () { this.setAttribute("open", ""); };
  P.close = function () {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

const BOARD = (panel) => `
  <main sap state="open">
    <section items="lists">
      <div item template data-id=""><ul items="cards"><li item template data-id=""><span bind="title"></span></li></ul></div>
      <div item data-id="l1"><ul items="cards"><li item template data-id=""><span bind="title"></span></li><li item data-id="a"><span bind="title">Alpha</span></li></ul></div>
      <div item data-id="l2"><ul items="cards"><li item template data-id=""><span bind="title"></span></li><li item data-id="b"><span bind="title">Beta</span></li></ul></div>
    </section>
    ${panel}
  </main>`;

const warns = () => Sap.report().warnings.map((w) => w.code);

describe("detail through nested lists", () => {
  test("lists.cards finds a card in any list", async () => {
    const root = mount(BOARD(`<aside detail="lists.cards by state.open"><input id="t" bind="title"></aside>`));
    const aside = root.querySelector("aside");
    expect(aside.hidden).toBe(true);
    Sap(root).open = "b";
    await flush();
    expect(aside.hidden).toBe(false);
    expect(root.querySelector("#t").value).toBe("Beta");
    Sap(root).open = "a";
    await flush();
    expect(root.querySelector("#t").value).toBe("Alpha");
  });
});

describe("detail on a dialog", () => {
  const DIALOG = `<div clay="freeze"><dialog detail="lists.cards by state.open"><input id="t" bind="title"></dialog></div>`;

  test("opens with showModal when a row matches and closes when none does", async () => {
    const root = mount(BOARD(DIALOG));
    const dlg = root.querySelector("dialog");
    expect(dlg.open).toBe(false);
    expect(dlg.hidden).toBe(false);
    Sap(root).open = "a";
    await flush();
    expect(dlg.open).toBe(true);
    expect(dlg.hidden).toBe(false);
    expect(root.querySelector("#t").value).toBe("Alpha");
    Sap(root).open = "";
    await flush();
    expect(dlg.open).toBe(false);
  });

  test("a user close clears the key so the next pass does not reopen it", async () => {
    const root = mount(BOARD(DIALOG));
    const dlg = root.querySelector("dialog");
    Sap(root).open = "b";
    await flush();
    dlg.close();
    await flush();
    expect(Sap(root).open).toBe("");
    Sap.refresh();
    expect(dlg.open).toBe(false);
  });

  test("W31 warns only when the dialog would be saved", () => {
    mount(BOARD(`<dialog detail="lists.cards by state.open"></dialog>`));
    expect(warns()).toContain("W31");
    mount(BOARD(DIALOG));
    expect(warns()).not.toContain("W31");
  });
});
