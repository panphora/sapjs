import { mount, Sap } from "./helpers/mount.js";

function codesFor(html) {
  mount(html);
  return Sap.report().errors.map((e) => e.code);
}

function warnsFor(html) {
  mount(html);
  return Sap.report().warnings.map((w) => w.code);
}

describe("mount lint: loud, attributed, halting failures", () => {
  test("E01 foreign-dialect attribute halts and teaches the native spelling", () => {
    mount(`<main sap><span x-text="foo">hi</span></main>`);
    const e = Sap.report().errors[0];
    expect(e.code).toBe("E01");
    expect(e.fix).toMatch(/text=/);
    expect(Sap.status().apps[0].ok).toBe(false);
  });

  test("E02 moustaches in text content halt", () => {
    expect(codesFor(`<main sap><p>{{ x }}</p></main>`)).toContain("E02");
  });

  test("E04 duplicate declaration in one scope", () => {
    expect(codesFor(`<main sap state="a a"></main>`)).toContain("E04");
  });

  test("E05 reserved-name collision", () => {
    expect(codesFor(`<main sap state="items"></main>`)).toContain("E05");
  });

  test("E06 state field collides with a global HTML name", () => {
    expect(codesFor(`<main sap state="title"></main>`)).toContain("E06");
  });

  test("E08 hyphenated field name (parses as subtraction)", () => {
    expect(codesFor(`<main sap state="total-tax"></main>`)).toContain("E08");
  });

  test("E10 orphan item", () => {
    expect(codesFor(`<main sap><li item><span bind="x"></span></li></main>`)).toContain("E10");
  });

  test("E18 text paint on a form control", () => {
    expect(codesFor(`<main sap><input bind="x" text="state.x"></main>`)).toContain("E18");
  });

  test("E30 attr:value on a bound control", () => {
    expect(codesFor(`<main sap><input bind="x" attr:value="1"></main>`)).toContain("E30");
  });

  test("E30 effect assigning value on a bound control", () => {
    expect(codesFor(`<main sap><input bind="x" effect="el.value='y'"></main>`)).toContain("E30");
  });

  test("E31 password bind without transient is the loudest error", () => {
    expect(codesFor(`<main sap><input type="password" bind="pw"></main>`)).toContain("E31");
  });

  test("E31 is cleared when transient is present", () => {
    expect(codesFor(`<main sap><input type="password" bind="pw" transient></main>`)).not.toContain("E31");
  });

  test("E32 bind on a file input", () => {
    expect(codesFor(`<main sap><input type="file" bind="f"></main>`)).toContain("E32");
  });

  test("E33 state=open on a dialog", () => {
    expect(codesFor(`<main sap><dialog state="open"></dialog></main>`)).toContain("E33");
  });

  test("nested items inside a detail panel halts (v1)", () => {
    expect(codesFor(`<main sap state="s"><form detail="xs by state.s"><ul items="ys"><li item template></li></ul></form></main>`)).toContain("E17");
  });
});

describe("mount lint: warnings never halt", () => {
  test("W03 unknown colon-prefixed attribute warns but the app still mounts", () => {
    mount(`<main sap><span foo:bar="x">hi</span></main>`);
    expect(Sap.report().warnings.map((w) => w.code)).toContain("W03");
    expect(Sap.status().apps[0].ok).toBe(true);
  });

  test("attr:hidden warns and redirects to show", () => {
    expect(warnsFor(`<main sap><p attr:hidden="state.x">hi</p></main>`)).toContain("W03");
  });
});
