import { mount, type, Sap } from "./helpers/mount.js";
import { mayWriteRecord } from "../src/platform.js";

// A stand-in for clayjs's region capability: the same shape Sap reads
// (resolveRegionPolicy -> { persist }), resolved from a self-or-ancestor walk.
function policyFor(node) {
  for (let cur = node; cur && cur.nodeType === 1; cur = cur.parentElement) {
    const tokens = new Set((cur.getAttribute("clay") || "").split(/\s+/).filter(Boolean));
    if (tokens.has("no-save") || cur.hasAttribute("no-save") || cur.hasAttribute("save-remove")) return { persist: "none", dirtyTracked: false };
    if (tokens.has("freeze") || cur.hasAttribute("freeze") || cur.hasAttribute("save-freeze")) return { persist: "frozen", dirtyTracked: false };
    if (tokens.has("no-dirty") || cur.hasAttribute("no-dirty") || cur.hasAttribute("save-ignore")) return { persist: "full", dirtyTracked: false };
  }
  return { persist: "full", dirtyTracked: true };
}

function platform({ writable = true, consent = null } = {}) {
  const lifecycle = { writable, canWrite() { return this.writable; } };
  window.clay = { modeLifecycle: lifecycle, region: { resolveRegionPolicy: policyFor } };
  if (consent) window.clay.confirm = consent;
  return lifecycle;
}

const BOARD = `
  <main sap state="sel q">
    <section items="cards" hidden>
      <article item template data-id="" state="data-done:presence"><input bind="title"></article>
      <article item data-id="c1" state="data-done:presence"><input bind="title" value="Alpha"></article>
      <article item data-id="c2" state="data-done:presence" data-done><input bind="title" value="Beta"></article>
    </section>
    <ul id="v" each="state.cards">
      <template><li><input class="t" bind="title"><input class="q" bind="q"><button class="pick" set:sel="item.$key">pick</button></li></template>
    </ul>
    <output id="o" text="state.cards.map(c => c.title).join(',')"></output>
  </main>`;

const row = (root, key) => root.querySelector(`#v > [data-key="${key}"]`);
const record = (root, key) => root.querySelector(`[data-id="${key}"]`);

afterEach(() => {
  delete window.clay;
});

describe("mayWriteRecord", () => {
  test("standalone admits every write and reads no platform", () => {
    const root = mount(BOARD);
    expect(mayWriteRecord(root)).toBe(true);
    type(row(root, "c1").querySelector(".t"), "Alpha 2");
    expect(record(root, "c1").querySelector("input").value).toBe("Alpha 2");
  });

  test("a host without a mode lifecycle keeps the old behavior", () => {
    const root = mount(BOARD);
    window.clay = { region: { resolveRegionPolicy: policyFor } };
    expect(mayWriteRecord(root)).toBe(true);
    window.clay = { modeLifecycle: {} };
    expect(mayWriteRecord(root)).toBe(true);
  });

  test("refuses while canWrite() is false and admits again when it is true", () => {
    const lifecycle = platform();
    const root = mount(BOARD);
    expect(mayWriteRecord(root)).toBe(true);
    lifecycle.writable = false;
    expect(mayWriteRecord(root)).toBe(false);
    lifecycle.writable = true;
    expect(mayWriteRecord(root)).toBe(true);
  });

  test("explicit transient state is admitted in view", () => {
    platform({ writable: false });
    const root = mount(BOARD);
    expect(mayWriteRecord(root)).toBe(false);
    expect(mayWriteRecord(root, { transient: true })).toBe(true);
  });

  test("a no-save region is not a record destination", () => {
    platform({ writable: false });
    const root = mount(`<main sap><div clay="no-save"><input id="a"></div></main>`);
    expect(mayWriteRecord(root.querySelector("#a"))).toBe(true);
  });

  test("a frozen root's saved attributes remain records", () => {
    platform({ writable: false });
    const root = mount(`<main sap><div clay="freeze"><input id="b"></div></main>`);
    expect(mayWriteRecord(root.querySelector("#b"))).toBe(false);
  });

  test("no-dirty is not write permission", () => {
    platform({ writable: false });
    const root = mount(`<main sap><div clay="no-dirty"><input id="c"></div></main>`);
    expect(mayWriteRecord(root.querySelector("#c"))).toBe(false);
  });
});

describe("record writes at their real destinations", () => {
  test("an edit-mode row control still writes through to its record", async () => {
    platform();
    const root = mount(BOARD);
    type(row(root, "c1").querySelector(".t"), "Alpha 2");
    await flush();
    expect(record(root, "c1").querySelector("input").value).toBe("Alpha 2");
    expect(root.querySelector("#o").textContent).toBe("Alpha 2,Beta");
  });

  test("view refuses the same write and the record keeps its value", async () => {
    platform({ writable: false });
    const root = mount(BOARD);
    type(row(root, "c1").querySelector(".t"), "Alpha 2");
    await flush();
    expect(record(root, "c1").querySelector("input").value).toBe("Alpha");
    expect(root.querySelector("#o").textContent).toBe("Alpha,Beta");
  });

  test("a proxy setter refuses in view without throwing", async () => {
    platform({ writable: false });
    const root = mount(BOARD);
    let threw = false;
    try {
      Sap(row(root, "c1").querySelector(".t")).title = "Beta";
      Sap(root).q = "hello";
    } catch {
      threw = true;
    }
    await flush();
    expect(threw).toBe(false);
    expect(record(root, "c1").querySelector("input").value).toBe("Alpha");
    expect(Sap(root).q).not.toBe("hello");
    expect(root.hasAttribute("q")).toBe(false);
  });

  test("an auto-declared root field is not declared in view", async () => {
    platform({ writable: false });
    const root = mount(BOARD);
    Sap(root).nickname = "Ada";
    await flush();
    expect(root.getAttribute("state")).toBe("sel q");
    expect(root.hasAttribute("nickname")).toBe(false);
    expect(Sap(root).nickname).toBeUndefined();
  });

  test("an auto-declared root field still declares in edit", async () => {
    platform();
    const root = mount(BOARD);
    Sap(root).nickname = "Ada";
    await flush();
    expect(root.getAttribute("state")).toBe("sel q nickname");
    expect(root.getAttribute("nickname")).toBe("Ada");
  });

  test("transient state still writes in view", async () => {
    platform({ writable: false });
    const root = mount(`<main sap state="q:transient"><output id="o" text="state.q"></output></main>`);
    Sap(root).q = "kept";
    await flush();
    expect(Sap(root).q).toBe("kept");
    expect(root.hasAttribute("q")).toBe(false);
  });

  test("a persist control mirrors in a no-save region but not in a freeze region", () => {
    platform({ writable: false });
    const root = mount(`
      <main sap>
        <div clay="no-save"><input id="a" bind="a" value="A" persist></div>
        <div clay="freeze"><input id="b" bind="b" value="B" persist></div>
      </main>`);
    type(root.querySelector("#a"), "A2");
    type(root.querySelector("#b"), "B2");
    expect(root.querySelector("#a").getAttribute("value")).toBe("A2");
    expect(root.querySelector("#b").getAttribute("value")).toBe("B");
  });

  test("a detail projection refuses in view and leaves its source intact", async () => {
    const lifecycle = platform();
    const root = mount(`
      <main sap state="open">
        <section items="cards">
          <article item template data-id=""><input bind="title"></article>
          <article item data-id="c1"><input class="s" bind="title" value="Alpha"></article>
        </section>
        <aside detail="cards by state.open"><input id="t" bind="title"></aside>
      </main>`);
    Sap(root).open = "c1";
    await flush();
    expect(root.querySelector("#t").value).toBe("Alpha");
    lifecycle.writable = false;
    type(root.querySelector("#t"), "Beta");
    await flush();
    expect(record(root, "c1").querySelector("input").value).toBe("Alpha");
    expect(root.querySelector("#t").value).toBe("Beta");
  });
});

describe("collection actions", () => {
  const LIST = `
    <main sap state="draft q:transient">
      <form trigger-add="items"><input bind="draft"></form>
      <ul items="items">
        <li item template data-id=""><input bind="name"></li>
        <li item data-id="i1"><input class="n" bind="name" value="One"><button class="up" move:up>up</button><button class="rm" trigger-remove>x</button></li>
        <li item data-id="i2"><input class="n" bind="name" value="Two"></li>
      </ul>
      <button id="sort" sort:name="items">sort</button>
    </main>`;
  const names = (root) => [...root.querySelectorAll("[items=items] > [item]:not([template]) input")].map((i) => i.value);

  test("trigger-add is refused in view and the composer keeps its text", async () => {
    platform({ writable: false });
    const root = mount(LIST);
    const form = root.querySelector("form");
    form.querySelector("input").value = "Three";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(2);
    expect(form.querySelector("input").value).toBe("Three");
  });

  test("trigger-add still clones in edit", async () => {
    platform();
    const root = mount(LIST);
    root.querySelector("form").querySelector("input").value = "Three";
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(3);
    expect(root.querySelector("form input").value).toBe("");
  });

  test("trigger-remove is refused in view", async () => {
    platform({ writable: false });
    const root = mount(LIST);
    root.querySelector(".rm").click();
    await flush();
    expect(names(root)).toEqual(["One", "Two"]);
  });

  test("moving a record is refused in view on both sides", async () => {
    platform({ writable: false });
    const root = mount(LIST);
    root.querySelector(".up").click();
    await flush();
    expect(names(root)).toEqual(["One", "Two"]);
    Sap(root).$move("items");
    await flush();
    expect(names(root)).toEqual(["One", "Two"]);
  });

  test("sorting a record list is refused in view", async () => {
    platform({ writable: false });
    const root = mount(LIST);
    root.querySelector("#sort").click();
    await flush();
    expect(names(root)).toEqual(["One", "Two"]);
  });

  test("a mixed reset preflights and mutates nothing", async () => {
    const lifecycle = platform();
    const root = mount(LIST);
    Sap(root).q = "keep";
    await flush();
    lifecycle.writable = false;
    Sap(root).$reset();
    await flush();
    expect(Sap(root).q).toBe("keep");
    expect(names(root)).toEqual(["One", "Two"]);
    expect(root.querySelector('[data-id="i1"] input').getAttribute("value")).toBe("One");
  });

  test("a native reset dispatches no events in view", async () => {
    platform({ writable: false });
    const root = mount(LIST);
    const input = root.querySelector('[data-id="i1"] input');
    let events = 0;
    input.addEventListener("input", () => { events++; });
    root.addEventListener("reset", (e) => e.preventDefault());
    root.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toBe(0);
    expect(input.getAttribute("value")).toBe("One");
  });

  test("a native reset still replays the controls in edit", async () => {
    platform();
    const root = mount(LIST);
    const input = root.querySelector('[data-id="i1"] input');
    let events = 0;
    input.addEventListener("input", () => { events++; });
    root.addEventListener("reset", (e) => e.preventDefault());
    root.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toBeGreaterThan(0);
  });
});

describe("a held confirmation cannot cross a mode change", () => {
  const CONFIRM = `
    <main sap>
      <ul items="items">
        <li item template data-id=""><input bind="name"></li>
        <li item data-id="i1"><input bind="name" value="One"><button id="wipe" confirm="Delete it?" trigger-remove>x</button></li>
      </ul>
    </main>`;

  test("a confirmation opened in edit is refused after the mode leaves edit", async () => {
    let pending = null;
    const lifecycle = platform({ consent: (msg, yes) => { pending = { msg, yes }; return Promise.resolve(); } });
    const root = mount(CONFIRM);
    root.querySelector("#wipe").click();
    expect(pending.msg).toBe("Delete it?");
    lifecycle.writable = false;
    pending.yes();
    await flush();
    expect(root.querySelector('[data-id="i1"]')).not.toBeNull();
    expect(root.querySelector("#wipe")._sapGatePending).toBe(false);
  });

  test("a confirmation cannot cross into a new mode session", async () => {
    let pending = null;
    platform({ consent: (msg, yes) => { pending = { msg, yes }; return Promise.resolve(); } });
    const root = mount(CONFIRM);
    root.querySelector("#wipe").click();
    platform();
    pending.yes();
    await flush();
    expect(root.querySelector('[data-id="i1"]')).not.toBeNull();
  });

  test("the same confirmation applies while the session still admits writes", async () => {
    let pending = null;
    platform({ consent: (msg, yes) => { pending = { msg, yes }; return Promise.resolve(); } });
    const root = mount(CONFIRM);
    root.querySelector("#wipe").click();
    pending.yes();
    await flush();
    expect(root.querySelector('[data-id="i1"]')).toBeNull();
  });
});

describe("lint", () => {
  test("viewmode: is a platform prefix, not a typo - no W03", () => {
    platform({ writable: false });
    mount(`<main sap><button viewmode:disabled>x</button></main>`);
    expect(Sap.report().warnings.map((w) => w.code)).not.toContain("W03");
  });
});
