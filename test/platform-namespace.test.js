// Two clients provide the platform API. hyperclayjs owns window.hyperclay and spells
// the dialog consent(); clayjs owns window.clay and spells it confirm(). Every read is
// dual, clay first, because losing an arm is silent: the save guard stops guarding, the
// confirm dialog drops to the native box, and undo/redo stop re-deriving.
//
// installBridges is process-scoped (sap.js installs it once), so this lives in its own
// file: importing sap.js anywhere here would arm a second handshake listener and the
// "wired once" count would be meaningless.

import {
  capability,
  regionSkipsSave,
  platformConsent,
  installBridges,
  onPlatformEvent,
  MUTATION_READY,
} from "../src/platform.js";

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

// The claim semantics belong to onPlatformEvent, so they are measured on it directly.
// They used to be measured through the undo handshake, which cannot show them any
// more: the handshake binds once and then removes its own listeners, so a second
// occurrence of a name has nothing left to count.
describe("both mutation-ready spellings", () => {
  test("one name claims the tick, a different name is suppressed, a repeat of the same name is not", async () => {
    const handler = jest.fn();
    const off = onPlatformEvent(document, MUTATION_READY, handler);

    try {
      document.dispatchEvent(new Event("clay:mutation-ready"));
      expect(handler).toHaveBeenCalledTimes(1);

      await Promise.resolve();       // the claim is released on a microtask
      handler.mockClear();

      // clayjs fires both names back to back in one tick.
      document.dispatchEvent(new Event("clay:mutation-ready"));
      document.dispatchEvent(new Event("hyperclay:mutation-ready"));
      expect(handler).toHaveBeenCalledTimes(1);   // one occurrence, not one per name

      await Promise.resolve();
      handler.mockClear();

      // Two genuine occurrences of the SAME name in one tick are both real: the claim
      // suppresses a different name, never a repeat.
      document.dispatchEvent(new Event("clay:mutation-ready"));
      document.dispatchEvent(new Event("clay:mutation-ready"));
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      off();
    }
  });

  test("clay:mutation-ready alone wires the undo handshake, once", () => {
    // A real emitter hands back an unsubscribe function, and that return value is
    // what the handshake reads to know the subscription actually attached. A bare
    // jest.fn() returns undefined, which is hyper-undo's dropped-subscription shape.
    const undo = { on: jest.fn(() => () => {}) };
    const handshakes = () => undo.on.mock.calls.filter((c) => c[0] === "undo").length;

    installBridges(fakeRuntime());   // nothing on window yet -> the lazy handshake path
    window.clay = { undo };

    document.dispatchEvent(new Event("clay:mutation-ready"));
    expect(handshakes()).toBe(1);
    expect(undo.on.mock.calls.map((c) => c[0])).toEqual(["undo", "redo"]);

    // Bound is bound: the handshake removed its own listeners, so a later signal
    // cannot subscribe a second pair of handlers.
    document.dispatchEvent(new Event("clay:mutation-ready"));
    document.dispatchEvent(new Event("hyperclay:ready"));
    expect(handshakes()).toBe(1);
  });
});
