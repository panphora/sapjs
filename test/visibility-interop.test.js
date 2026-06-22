// Shared-contract visibility interop: sapjs honors show-when/hide-when/option/
// option-not, materializes the mode default so the CSS floor can match it, and
// defers to hyperclayjs optionVisibility when that floor is present.

import { mount, Sap } from "./helpers/mount.js";

const TABS = `
  <main sap state="tab=overview">
    <span id="po" class="pill" set:tab="'overview'">Overview</span>
    <span id="pp" class="pill" set:tab="'pricing'">Pricing</span>
    <span id="pf" class="pill" set:tab="'faq'">FAQ</span>
    <section id="so" show-when:tab="overview">o</section>
    <section id="sp" show-when:tab="pricing">p</section>
    <section id="sf" show-when:tab="faq">f</section>
  </main>`;

const hidden = (root, id) => root.querySelector("#" + id).hidden;

afterEach(() => {
  delete window.hyperclay;
  document.documentElement.removeAttribute("editmode");
  document.documentElement.removeAttribute("pageowner");
});

describe("show-when (sapjs, no floor present)", () => {
  test("shows the matching panel, hides the rest", () => {
    const root = mount(TABS);
    expect(hidden(root, "so")).toBe(false);
    expect(hidden(root, "sp")).toBe(true);
    expect(hidden(root, "sf")).toBe(true);
  });

  test("set: changes the mode and visibility follows", async () => {
    const root = mount(TABS);
    root.querySelector("#pp").click();
    await flush();
    expect(hidden(root, "so")).toBe(true);
    expect(hidden(root, "sp")).toBe(false);
    expect(hidden(root, "sf")).toBe(true);
  });
});

describe("hide-when is the inverse of show-when", () => {
  test("hides the matching panel, shows the rest", () => {
    const root = mount(`
      <main sap state="tab=overview">
        <section id="a" hide-when:tab="overview">a</section>
        <section id="b" hide-when:tab="pricing">b</section>
      </main>`);
    expect(hidden(root, "a")).toBe(true);  // tab IS overview -> hidden
    expect(hidden(root, "b")).toBe(false); // tab is not pricing -> shown
  });
});

describe("legacy option: / option-not: aliases work in sapjs", () => {
  test("option: behaves like show-when", () => {
    const root = mount(`
      <main sap state="tab=overview">
        <section id="a" option:tab="overview">a</section>
        <section id="b" option:tab="pricing">b</section>
      </main>`);
    expect(hidden(root, "a")).toBe(false);
    expect(hidden(root, "b")).toBe(true);
  });

  test("option-not: shows when present but not equal (distinct from hide-when)", () => {
    const root = mount(`
      <main sap state="tab=overview">
        <section id="a" option-not:tab="pricing">a</section>
        <section id="b" option-not:tab="overview">b</section>
      </main>`);
    expect(hidden(root, "a")).toBe(false); // tab present, != pricing -> shown
    expect(hidden(root, "b")).toBe(true);  // tab present, == overview -> hidden
  });
});

describe("pipe OR", () => {
  test("show-when matches any of the piped values", () => {
    const root = mount(`
      <main sap state="tab=faq">
        <section id="a" show-when:tab="overview|faq">a</section>
        <section id="b" show-when:tab="overview|pricing">b</section>
      </main>`);
    expect(hidden(root, "a")).toBe(false); // faq is in the list
    expect(hidden(root, "b")).toBe(true);
  });
});

describe("default materialization", () => {
  test("a state field a visibility verb reads is materialized to a bare attr at mount", () => {
    const root = mount(TABS);
    expect(root.getAttribute("tab")).toBe("overview");
  });

  test("a state field NO visibility verb reads is NOT materialized (purely additive)", () => {
    const root = mount(`<main sap state="mode=editing"><span text="state.mode"></span></main>`);
    expect(root.hasAttribute("mode")).toBe(false);
  });

  test("a transient mode is never materialized to the DOM; use show= (Layer 2), not show-when", () => {
    // show-when reads the DOM (Layer 0), so it cannot see a transient field whose
    // whole contract is to stay off-DOM. The Layer-2 show= reads the runtime store.
    const root = mount(`
      <main sap state="tab:transient=overview">
        <section id="a" show="state.tab === 'overview'">a</section>
      </main>`);
    expect(root.hasAttribute("tab")).toBe(false); // privacy: never serialized
    expect(hidden(root, "a")).toBe(false);        // show= drives visibility from the store
  });

  test("materialization and derived paints are undo-paused so they do not dirty history", () => {
    const pause = jest.fn();
    const resume = jest.fn();
    window.hyperclay = { undo: { pause, resume } };
    mount(TABS);
    // Materialization pauses once; the derived paint window pauses again. Both are
    // balanced (every pause has a matching resume) so undo depth never leaks.
    expect(pause).toHaveBeenCalled();
    expect(resume).toHaveBeenCalledTimes(pause.mock.calls.length);
  });
});

describe("coordination handshake: defer to the CSS floor when present", () => {
  test("sapjs does not set hidden when optionVisibility is started", () => {
    window.hyperclay = { optionVisibility: { _started: true } };
    const root = mount(TABS);
    // Floor (CSS) owns visibility; sapjs leaves hidden untouched on every panel.
    expect(hidden(root, "so")).toBe(false);
    expect(hidden(root, "sp")).toBe(false);
    expect(hidden(root, "sf")).toBe(false);
    // but it still materializes the mode attr so the floor's selector can match.
    expect(root.getAttribute("tab")).toBe("overview");
  });

  test("an unstarted floor object does not cause a defer (safe degradation)", () => {
    window.hyperclay = { optionVisibility: { _started: false } };
    const root = mount(TABS);
    expect(hidden(root, "sp")).toBe(true); // sapjs still paints when floor isn't owning it
  });
});

describe("editmode Layer-0 bridge (hyperclayjs stamps editmode on <html>)", () => {
  // hyperclayjs sets <html editmode="true|false"> on load (and resets it to false
  // before save). show-when:editmode reads it via the nearest-ancestor walk, so
  // edit-only UI shows in edit mode with no sapjs state declaration needed.
  const EDITUI = `<main sap><button id="edit" show-when:editmode="true">Edit</button></main>`;

  test('shows edit-only UI when <html editmode="true">', () => {
    document.documentElement.setAttribute("editmode", "true");
    const root = mount(EDITUI);
    expect(hidden(root, "edit")).toBe(false);
  });

  test('hides edit-only UI when <html editmode="false"> (the saved-file state)', () => {
    document.documentElement.setAttribute("editmode", "false");
    const root = mount(EDITUI);
    expect(hidden(root, "edit")).toBe(true);
  });

  test("defers to the hyperclayjs CSS floor when optionVisibility is started", () => {
    document.documentElement.setAttribute("editmode", "false");
    window.hyperclay = { optionVisibility: { _started: true } };
    const root = mount(EDITUI);
    // floor owns visibility; sapjs leaves hidden untouched even though editmode=false
    expect(hidden(root, "edit")).toBe(false);
  });
});
