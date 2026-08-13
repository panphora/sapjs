// Two clients provide the platform API. hyperclayjs owns window.hyperclay and spells
// the dialog consent(); clayjs owns window.clay and spells it confirm(). Every read is
// dual, clay first, because losing an arm is silent: the save guard stops guarding, the
// confirm dialog drops to the native box, and undo/redo stop re-deriving.
//
// installBridges is process-scoped (sap.js installs it once), so this lives in its own
// file: importing sap.js anywhere here would arm a second handshake listener and the
// "wired once" count would be meaningless.

import { capability, regionSkipsSave, platformConsent, installBridges } from "../src/platform.js";

const fakeRuntime = () => ({
  apps: () => [],
  runNow() {},
  pruneDisconnected() {},
  remountIfPresent() {},
});

afterEach(() => {
  delete window.clay;
  delete window.hyperclay;
});

describe("capability resolution", () => {
  test("clay wins, hyperclay is the fallback, neither is null", () => {
    expect(capability("undo")).toBeNull();

    window.hyperclay = { undo: "legacy" };
    expect(capability("undo")).toBe("legacy");

    window.clay = { undo: "clay" };
    expect(capability("undo")).toBe("clay");
  });

  test("consent is the renamed one: clay.confirm, hyperclay.consent", () => {
    const clayFn = () => {};
    const legacyFn = () => {};

    window.hyperclay = { consent: legacyFn };
    expect(platformConsent()).toBe(legacyFn);

    window.clay = { confirm: clayFn };
    expect(platformConsent()).toBe(clayFn);
  });

  test("the save guard reads the region model off clay", () => {
    const el = document.createElement("div");
    expect(regionSkipsSave(el)).toBe(false);

    window.clay = {
      region: {
        resolveRegionPolicy: () => ({ persist: "none" }),
        skipForPolicy: () => true,
      },
    };
    expect(regionSkipsSave(el)).toBe(true);
  });
});

describe("both mutation-ready spellings", () => {
  test("clay:mutation-ready alone wires the undo handshake, and both spellings in one tick wire it once", async () => {
    const undo = { on: jest.fn() };
    const handshakes = () => undo.on.mock.calls.filter((c) => c[0] === "undo").length;

    installBridges(fakeRuntime());   // nothing on window yet -> the lazy handshake path
    window.clay = { undo };

    document.dispatchEvent(new Event("clay:mutation-ready"));
    expect(handshakes()).toBe(1);
    expect(undo.on.mock.calls.map((c) => c[0])).toEqual(["undo", "redo"]);

    await Promise.resolve();         // the claim is released on a microtask
    undo.on.mockClear();

    // clayjs fires both names back to back in one tick.
    document.dispatchEvent(new Event("clay:mutation-ready"));
    document.dispatchEvent(new Event("hyperclay:mutation-ready"));
    expect(handshakes()).toBe(1);    // one occurrence, not one per name

    await Promise.resolve();
    undo.on.mockClear();

    // Two genuine occurrences of the SAME name in one tick are both real: the claim
    // suppresses a different name, never a repeat.
    document.dispatchEvent(new Event("clay:mutation-ready"));
    document.dispatchEvent(new Event("clay:mutation-ready"));
    expect(handshakes()).toBe(2);
  });
});
