import { mount, type, Sap } from "./helpers/mount.js";

const PAD = `
  <main sap state="selected">
    <section items="entries">
      <article item template data-id="" state="data-date data-created-at"></article>
      <article item data-id="a1" state="data-date data-created-at" data-date="2026-10-07" data-created-at="2026-10-07T09:00" set:selected="item.$key"></article>
      <article item data-id="b2" state="data-date data-created-at" data-date="2026-10-09" data-created-at="2026-10-09T08:00" set:selected="item.$key"></article>
    </section>
    <output id="dates" text="state.entries.map(e => e.date).join(',')"></output>
    <output id="created" text="state.entries[0].createdAt"></output>
    <header detail="entries by state.selected">
      <input type="date" bind="date" id="d">
      <input bind="nope" id="nope">
    </header>
  </main>`;

describe("data-* state fields", () => {
  test("a data-* field reads as its camelCase name", () => {
    const root = mount(PAD);
    expect(root.querySelector("#dates").textContent).toBe("2026-10-07,2026-10-09");
    expect(root.querySelector("#created").textContent).toBe("2026-10-07T09:00");
    expect(Sap.status().ok).toBe(true);
  });

  test("Sap(row).date writes the data-date attribute", async () => {
    const root = mount(PAD);
    const row = root.querySelector('[data-id="a1"]');
    Sap(row).date = "2026-01-01";
    await flush();
    expect(row.getAttribute("data-date")).toBe("2026-01-01");
    expect(row.hasAttribute("date")).toBe(false);
    expect(root.querySelector("#dates").textContent).toBe("2026-01-01,2026-10-09");
  });

  test("a detail input bound to a data-* field projects it and writes it back", async () => {
    const root = mount(PAD);
    root.querySelector('[data-id="b2"]').click();
    await flush();
    const input = root.querySelector("#d");
    expect(input.value).toBe("2026-10-09");
    type(input, "2026-12-25");
    await flush();
    expect(root.querySelector('[data-id="b2"]').getAttribute("data-date")).toBe("2026-12-25");
    expect(root.querySelector("#dates").textContent).toBe("2026-10-07,2026-12-25");
  });

  test("a detail input bound to an undeclared field writes nothing", async () => {
    const root = mount(PAD);
    root.querySelector('[data-id="b2"]').click();
    await flush();
    type(root.querySelector("#nope"), "x");
    await flush();
    expect(root.hasAttribute("nope")).toBe(false);
    expect(root.querySelector('[data-id="b2"]').hasAttribute("nope")).toBe(false);
  });

  test("a hyphenated non-data field still halts with E08", () => {
    mount(`<main sap state="my-field"><output text="1"></output></main>`);
    expect(Sap.report().errors.map((e) => e.code)).toContain("E08");
  });

  test("data-id as a state field is not rejected as an HTML global", () => {
    const root = mount(`
      <main sap>
        <ul items="xs"><li item template state="data-title"></li><li item state="data-title" data-title="Hi"></li></ul>
        <output text="state.xs[0].title"></output>
      </main>`);
    expect(root.querySelector("output").textContent).toBe("Hi");
    expect(Sap.report().errors.map((e) => e.code)).not.toContain("E06");
  });
});
