// Mutation readiness truthfully announces the Mutation hub and nothing else, so an
// optional plugin like undo may not be published yet when it fires. Full platform
// readiness is the moment every requested module has loaded: clayjs spells it
// clay.ready / clay:ready, and hyperclayjs now spells it hyperclay.ready /
// hyperclay:ready. The handshake retries at every one of those signals and binds
// exactly once.
//
// installBridges is process-scoped and its listeners live on `document`, so a bridge
// that never binds keeps listening for the rest of the file. Every test here ends
// with its bridge bound, which is also what removes its listeners, so no test can
// pick up an earlier test's handshake.

import { installBridges } from "../src/platform.js";

const fakeRuntime = () => ({
  apps: () => [],
  runNow() {},
  pruneDisconnected() {},
  remountIfPresent() {},
});

// hyper-undo's shape. Its singleton delegator (src/index.js:142) returns undefined
// and silently drops the subscription until start() has run; a live emitter hands
// back an unsubscribe function (src/emitter.js).
const fakeUndo = ({ started = true } = {}) => {
  const subscriptions = [];
  return {
    subscriptions,
    start() {
      started = true;
    },
    on(name) {
      if (!started) return undefined;
      subscriptions.push(name);
      return () => {
        const index = subscriptions.indexOf(name);
        if (index !== -1) subscriptions.splice(index, 1);
      };
    },
  };
};

afterEach(() => {
  delete window.clay;
  delete window.hyperclay;
});

describe("undo binds at full platform readiness", () => {
  test("clay:ready binds undo that mutation-ready was too early to see", () => {
    window.clay = { Mutation: {} };
    installBridges(fakeRuntime());

    // The hub is up; undo is not published yet, so there is nothing to bind to.
    document.dispatchEvent(new Event("clay:mutation-ready"));

    const undo = fakeUndo();
    window.clay.undo = undo;

    document.dispatchEvent(new Event("clay:ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);

    // Bound once: the handshake removed its own listeners on the way out.
    document.dispatchEvent(new Event("clay:ready"));
    document.dispatchEvent(new Event("clay:mutation-ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });

  test("hyperclay:ready is the same moment under the other client's name", () => {
    window.hyperclay = { Mutation: {} };
    installBridges(fakeRuntime());

    document.dispatchEvent(new Event("hyperclay:mutation-ready"));

    const undo = fakeUndo();
    window.hyperclay.undo = undo;

    document.dispatchEvent(new Event("hyperclay:ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });

  test("both spellings in one tick bind one pair, not one pair per name", () => {
    window.clay = { Mutation: {} };
    installBridges(fakeRuntime());

    const undo = fakeUndo();
    window.clay.undo = undo;

    document.dispatchEvent(new Event("clay:ready"));
    document.dispatchEvent(new Event("hyperclay:ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });

  test("a resolving clay.ready promise binds undo without any event", async () => {
    let settle;
    window.clay = { Mutation: {}, ready: new Promise((resolve) => { settle = resolve; }) };
    installBridges(fakeRuntime());

    const undo = fakeUndo();
    window.clay.undo = undo;

    settle(window.clay);
    await window.clay.ready;
    await Promise.resolve();

    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });

  test("a resolving hyperclay.ready promise binds undo, and the event after it does not double it", async () => {
    let settle;
    window.hyperclay = { Mutation: {}, ready: new Promise((resolve) => { settle = resolve; }) };
    installBridges(fakeRuntime());

    const undo = fakeUndo();
    window.hyperclay.undo = undo;

    settle(window.hyperclay);
    await window.hyperclay.ready;
    await Promise.resolve();
    expect(undo.subscriptions).toEqual(["undo", "redo"]);

    document.dispatchEvent(new Event("hyperclay:ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });

  test("a rejecting ready promise leaves the handshake armed for a later event", async () => {
    let fail;
    const ready = new Promise((resolve, reject) => { fail = reject; });
    ready.catch(() => {});
    window.hyperclay = { Mutation: {}, ready };
    installBridges(fakeRuntime());

    fail(new Error("a module failed to load"));
    await Promise.resolve();
    await Promise.resolve();

    const undo = fakeUndo();
    window.hyperclay.undo = undo;
    document.dispatchEvent(new Event("hyperclay:mutation-ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });

  // The whole reason bindUndo reads on()'s return value. hyper-undo published before
  // start() accepts the call, returns undefined, and drops the subscription on the
  // floor. Marking itself bound there would leave undo/redo silently unwired forever.
  test("an on() that returns undefined leaves the handshake unbound, and a later signal rebinds", () => {
    window.hyperclay = { Mutation: {} };
    installBridges(fakeRuntime());

    const undo = fakeUndo({ started: false });
    window.hyperclay.undo = undo;

    document.dispatchEvent(new Event("hyperclay:mutation-ready"));
    expect(undo.subscriptions).toEqual([]);

    document.dispatchEvent(new Event("hyperclay:ready"));
    expect(undo.subscriptions).toEqual([]);

    undo.start();
    document.dispatchEvent(new Event("hyperclay:ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });

  test("undo already published at install time binds immediately, with no listeners left armed", () => {
    const undo = fakeUndo();
    window.clay = { undo };

    installBridges(fakeRuntime());
    expect(undo.subscriptions).toEqual(["undo", "redo"]);

    document.dispatchEvent(new Event("clay:ready"));
    expect(undo.subscriptions).toEqual(["undo", "redo"]);
  });
});
