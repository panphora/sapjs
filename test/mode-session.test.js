// Undo is an optional plugin, so the bridge binds it late and, until now, forgot the
// unsubscribe functions it was handed. A Sap session that hands the page on
// (Sap.unmount) must leave nothing behind: a stale subscription would keep refreshing
// a scope that no longer owns an app. A committed mode change starts a new session
// (clay:modechange, with a new modeLifecycle.state.generation) and may republish the
// plugin under a fresh implementation, so the pair is refreshed exactly once per
// session instead of once per page.

import { installBridges } from "../src/platform.js";

// A runtime scope. refresh is the bridge's callback: it asks the scope for its apps.
const scope = () => {
  const calls = { refresh: 0, prune: 0, remount: 0 };
  return {
    calls,
    apps() { calls.refresh++; return []; },
    runNow() {},
    pruneDisconnected() { calls.prune++; },
    remountIfPresent() { calls.remount++; },
  };
};

// hyper-undo's shape: on() hands back the only proof a handler really attached, and
// the returned function is the only way to take it off again.
const undoPlugin = () => {
  const listeners = [];
  return {
    listeners,
    names() { return listeners.map((entry) => entry.name); },
    on(name, fn) {
      const entry = { name, fn };
      listeners.push(entry);
      return () => {
        const index = listeners.indexOf(entry);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
    fire(name) {
      for (const entry of listeners.slice()) if (entry.name === name) entry.fn();
    },
  };
};

const lifecycle = (generation) => ({
  state: { mode: "edit", phase: "idle", destination: "host", generation, reason: null },
  canWrite: () => true,
});

const commitMode = (generation) => {
  window.clay.modeLifecycle.state = { mode: "edit", phase: "idle", destination: "host", generation, reason: null };
  document.dispatchEvent(new Event("clay:modechange"));
};

afterEach(() => {
  delete window.clay;
  delete window.hyperclay;
});

describe("undo follows the editing session", () => {
  test("a session binds one pair, and undo and redo both refresh it", () => {
    const undo = undoPlugin();
    window.clay = { undo, modeLifecycle: lifecycle(1) };
    const live = scope();

    const off = installBridges(live);
    expect(undo.names()).toEqual(["undo", "redo"]);

    undo.fire("undo");
    expect(live.calls.refresh).toBe(1);
    undo.fire("redo");
    expect(live.calls.refresh).toBe(2);

    off();
  });

  test("repeated readiness signals inside one session do not add a second pair", async () => {
    const undo = undoPlugin();
    let settle;
    window.clay = { undo, modeLifecycle: lifecycle(1), ready: new Promise((resolve) => { settle = resolve; }) };
    const live = scope();

    const off = installBridges(live);
    document.dispatchEvent(new Event("clay:mutation-ready"));
    document.dispatchEvent(new Event("clay:ready"));
    document.dispatchEvent(new Event("hyperclay:ready"));
    commitMode(1);
    settle(window.clay);
    await window.clay.ready;
    await Promise.resolve();

    expect(undo.names()).toEqual(["undo", "redo"]);
    undo.fire("undo");
    expect(live.calls.refresh).toBe(1);

    off();
  });

  test("a committed mode change refreshes the pair instead of stacking a second one", () => {
    const undo = undoPlugin();
    window.clay = { undo, modeLifecycle: lifecycle(1) };
    const live = scope();

    const off = installBridges(live);
    expect(undo.names()).toEqual(["undo", "redo"]);

    commitMode(2);
    expect(undo.names()).toEqual(["undo", "redo"]);

    undo.fire("undo");
    expect(live.calls.refresh).toBe(1);

    // The pair belongs to generation 2 now: the same generation again is a no-op.
    commitMode(2);
    expect(undo.names()).toEqual(["undo", "redo"]);

    off();
  });

  test("a republished undo implementation is followed and the retired one goes quiet", () => {
    const first = undoPlugin();
    const second = undoPlugin();
    window.clay = { undo: first, modeLifecycle: lifecycle(1) };
    const live = scope();

    const off = installBridges(live);
    expect(first.names()).toEqual(["undo", "redo"]);

    window.clay.undo = second;
    commitMode(2);
    expect(first.names()).toEqual([]);
    expect(second.names()).toEqual(["undo", "redo"]);

    first.fire("undo");
    expect(live.calls.refresh).toBe(0);
    second.fire("undo");
    expect(live.calls.refresh).toBe(1);

    off();
  });

  test("late plugin readiness after a committed mode change still binds exactly once", () => {
    window.clay = { modeLifecycle: lifecycle(1) };
    const live = scope();

    const off = installBridges(live);
    commitMode(2);

    const undo = undoPlugin();
    window.clay.undo = undo;
    document.dispatchEvent(new Event("clay:mutation-ready"));
    expect(undo.names()).toEqual(["undo", "redo"]);

    document.dispatchEvent(new Event("clay:ready"));
    commitMode(2);
    expect(undo.names()).toEqual(["undo", "redo"]);

    undo.fire("redo");
    expect(live.calls.refresh).toBe(1);

    off();
  });
});

describe("a retired session keeps no handles", () => {
  test("dispose detaches undo and the retired scope hears nothing", () => {
    const undo = undoPlugin();
    window.clay = { undo, modeLifecycle: lifecycle(1) };
    const live = scope();

    const off = installBridges(live);
    undo.fire("undo");
    expect(live.calls.refresh).toBe(1);

    off();
    expect(undo.names()).toEqual([]);

    undo.fire("undo");
    undo.fire("redo");
    document.dispatchEvent(new Event("clay:sync-applied"));
    document.dispatchEvent(new Event("clay:route"));
    document.dispatchEvent(new Event("clay:ready"));
    commitMode(2);
    expect(live.calls.refresh).toBe(1);
    expect(live.calls.remount).toBe(1);
  });

  test("a second session binds its own pair and only it hears the events", () => {
    const first = undoPlugin();
    window.clay = { undo: first, modeLifecycle: lifecycle(1) };
    const one = scope();
    const offOne = installBridges(one);
    first.fire("undo");
    expect(one.calls.refresh).toBe(1);

    offOne();

    const second = undoPlugin();
    window.clay = { undo: second, modeLifecycle: lifecycle(2) };
    const two = scope();
    const offTwo = installBridges(two);
    expect(first.names()).toEqual([]);
    expect(second.names()).toEqual(["undo", "redo"]);

    first.fire("undo");
    expect(one.calls.refresh).toBe(1);
    second.fire("undo");
    expect(two.calls.refresh).toBe(1);

    offTwo();
  });

  test("a session reusing the same plugin releases the earlier pair before binding", () => {
    const undo = undoPlugin();
    window.clay = { undo, modeLifecycle: lifecycle(1) };
    const one = scope();
    const offOne = installBridges(one);
    expect(undo.names()).toEqual(["undo", "redo"]);

    offOne();
    const two = scope();
    const offTwo = installBridges(two);
    expect(undo.names()).toEqual(["undo", "redo"]);

    undo.fire("undo");
    expect(one.calls.refresh).toBe(0);
    expect(two.calls.refresh).toBe(1);

    offTwo();
  });

  test("a ready promise that settles after disposal does not rebind", async () => {
    let settle;
    window.clay = { modeLifecycle: lifecycle(1), ready: new Promise((resolve) => { settle = resolve; }) };
    const live = scope();

    const off = installBridges(live);
    off();

    const undo = undoPlugin();
    window.clay.undo = undo;
    settle(window.clay);
    await window.clay.ready;
    await Promise.resolve();
    document.dispatchEvent(new Event("clay:ready"));

    expect(undo.names()).toEqual([]);
    expect(live.calls.refresh).toBe(0);
  });

});

describe("hosts without a mode lifecycle keep the old behavior", () => {
  test("standalone Sap binds nothing and survives a mode change event", () => {
    const live = scope();
    const off = installBridges(live);

    document.dispatchEvent(new Event("clay:modechange"));
    document.dispatchEvent(new Event("clay:mutation-ready"));
    expect(live.calls.refresh).toBe(0);

    off();
  });

  test("a host with undo but no lifecycle binds once, whatever mode it announces", () => {
    const undo = undoPlugin();
    window.clay = { undo };
    const live = scope();

    const off = installBridges(live);
    expect(undo.names()).toEqual(["undo", "redo"]);

    document.dispatchEvent(new Event("clay:modechange"));
    document.dispatchEvent(new Event("clay:mutation-ready"));
    expect(undo.names()).toEqual(["undo", "redo"]);

    undo.fire("undo");
    expect(live.calls.refresh).toBe(1);

    off();
  });
});

// The engine installs its bridge when its module evaluates, so it is loaded here,
// last, and its own handles are retired by the same unmount it hands the page with.
describe("the engine's own bridge", () => {
  test("Sap.unmount retires a real session's handles", () => {
    const undo = undoPlugin();
    window.clay = { undo, modeLifecycle: lifecycle(1) };
    const { Sap, mount } = require("./helpers/mount.js");

    mount(`<main sap><ul items="rows"><li item data-id="a" state="data-qty:num" data-qty="2"></li></ul><output text="sum(state.rows, 'qty')">0</output></main>`);
    expect(undo.names()).toEqual(["undo", "redo"]);
    expect(document.querySelector("output").textContent).toBe("2");

    undo.fire("undo");
    expect(document.querySelector("output").textContent).toBe("2");

    Sap.unmount();
    expect(undo.names()).toEqual([]);
  });
});
