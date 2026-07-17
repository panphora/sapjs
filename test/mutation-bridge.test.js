// Universal DOM-mutation reactivity: the MutationSource seam (hub + native backends),
// self-paint suppression / no-loop guarantee, [sap]-root scoping, the perpetual-remount
// prune, and the intended behavior changes. The bridge re-arms on Sap._reset() (which
// the mount helper calls), so each test gets a fresh source reflecting window.hyperclay.

import { mount, type, Sap } from "./helpers/mount.js";
import { _activeSourceKind, withDomMutationPaused } from "../src/mutation-bridge.js";

const tick = async (n = 4) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

afterEach(() => {
  Sap._reset();                 // tears down any active observer / mini-hub subscription
  delete window.hyperclay;
  document.documentElement.removeAttribute("editmode");
  delete window.__c;
});

// A faithful mini-hub: a real jsdom MutationObserver on document.body, a pausable
// subscriber that gets nothing while paused, and a resume() that takeRecords()-drains
// (discarding the paused batch for the pausable subscriber) — mirroring the real hub's
// _drainBrowserQueue routing to non-pausable consumers only.
function installMiniHub({ undo } = {}) {
  let depth = 0;
  const subs = [];
  const observer = new MutationObserver((records) => {
    if (depth > 0) return;
    const changes = normalize(records);
    if (changes.length) for (const s of subs.slice()) s.cb(changes);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  const hub = {
    onAnyChange(opts, cb) {
      const s = { opts, cb };
      subs.push(s);
      return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
    },
    pause() { depth++; if (undo && undo.pause) undo.pause(); },
    resume() {
      depth--;
      if (depth === 0) observer.takeRecords(); // drain-discard for the pausable subscriber
      if (undo && undo.resume) undo.resume();
    },
    _disconnect() { observer.disconnect(); },
  };
  window.hyperclay = Object.assign(window.hyperclay || {}, { Mutation: hub });
  if (undo) window.hyperclay.undo = undo;
  return hub;
}

function normalize(records) {
  const out = [];
  for (const rec of records) {
    if (rec.type === "attributes") out.push({ type: "attribute", element: rec.target });
    else if (rec.type === "characterData") {
      const el = rec.target.parentElement;
      if (el) out.push({ type: "characterData", element: el });
    } else if (rec.type === "childList") {
      for (const n of rec.addedNodes) if (n.nodeType === 1) out.push({ type: "add", element: n });
      for (const n of rec.removedNodes) if (n.nodeType === 1) out.push({ type: "remove", element: n, parent: rec.target });
    }
  }
  return out;
}

describe("source selection", () => {
  test("hub present -> hubSource, the pause-gated lane, no raw APIs", () => {
    const onAnyChange = jest.fn(() => () => {});
    const subscribeRaw = jest.fn();
    const createObserver = jest.fn();
    window.hyperclay = { Mutation: { onAnyChange, subscribeRaw, createObserver, pause: jest.fn(), resume: jest.fn() } };
    mount(`<main sap state="m=hi"><span text="state.m"></span></main>`);
    expect(_activeSourceKind()).toBe("hub");
    expect(onAnyChange).toHaveBeenCalledTimes(1);
    const opts = onAnyChange.mock.calls[0][0];
    expect(opts).toMatchObject({ require: "observed", debounce: 0 });
    expect(opts.pausable).toBeUndefined(); // pausable-default is load-bearing
    expect(subscribeRaw).not.toHaveBeenCalled();
    expect(createObserver).not.toHaveBeenCalled();
  });

  test("no hyperclay -> nativeSource", () => {
    mount(`<main sap state="m=hi"><span text="state.m"></span></main>`);
    expect(_activeSourceKind()).toBe("native");
  });

  test("bare window.hyperclay (namespace only, no Mutation) -> native now, cedes to a real late hub", () => {
    window.hyperclay = {}; // a namespace owner, but no Mutation hub will publish here
    mount(`<main sap state="m=hi"><span text="state.m"></span></main>`);
    expect(_activeSourceKind()).toBe("native"); // do NOT strand on a hub that may never come

    // a window-dispatched ready event must NOT cede (the hub fires on document)
    window.dispatchEvent(new Event("hyperclay:mutation-ready"));
    expect(_activeSourceKind()).toBe("native");

    // a real, document-dispatched hub cedes native -> hub, no double-observe
    window.hyperclay.Mutation = { onAnyChange: jest.fn(() => () => {}) };
    document.dispatchEvent(new Event("hyperclay:mutation-ready"));
    expect(_activeSourceKind()).toBe("hub");
  });

  test("bare window.hyperclay with no hub ever -> reactivity still works (the consent-shim trap)", async () => {
    window.hyperclay = {}; // e.g. clay-ui's consent shim created the namespace; core never boots
    const root = mount(`<main sap state="m=hi"><span id="out" text="state.m"></span></main>`);
    expect(root.querySelector("#out").textContent).toBe("hi");
    root.setAttribute("m", "bye"); // external write, no sap event, no hub to catch it
    await tick();
    expect(root.querySelector("#out").textContent).toBe("bye"); // native caught it, not stranded
  });

  test("native cedes to a late-arriving hub (no double-observe)", () => {
    mount(`<main sap state="m=hi"><span text="state.m"></span></main>`);
    expect(_activeSourceKind()).toBe("native");
    window.hyperclay = { Mutation: { onAnyChange: jest.fn(() => () => {}) } };
    document.dispatchEvent(new Event("hyperclay:mutation-ready"));
    expect(_activeSourceKind()).toBe("hub"); // native torn down, hub active
  });

  test("no MutationObserver and no hyperclay -> event-only, no throw", () => {
    const RealMO = global.MutationObserver;
    delete global.MutationObserver;
    try {
      expect(() => mount(`<main sap state="m=hi"><span text="state.m"></span></main>`)).not.toThrow();
      expect(_activeSourceKind()).toBe(null);
    } finally {
      global.MutationObserver = RealMO;
    }
  });
});

describe("native backend: reacts to external DOM mutations", () => {
  test("an external attribute change re-derives the app", async () => {
    const root = mount(`<main sap state="m=hi"><span id="out" text="state.m"></span></main>`);
    expect(root.querySelector("#out").textContent).toBe("hi");
    root.setAttribute("m", "bye"); // external write, no sap event
    await tick();
    expect(root.querySelector("#out").textContent).toBe("bye");
  });

  test("a mutation OUTSIDE any [sap] root schedules no pass", async () => {
    mount(`<main sap><span effect="window.__c = (window.__c||0)+1"></span></main>`);
    const base = window.__c; // effect ran at mount
    document.body.appendChild(document.createElement("div")); // outside the root
    await tick();
    expect(window.__c).toBe(base); // no extra pass
  });

  test("a mutation INSIDE the root does schedule a pass", async () => {
    const root = mount(`<main sap><span effect="window.__c = (window.__c||0)+1"></span></main>`);
    const base = window.__c;
    root.appendChild(document.createElement("div")); // inside the root
    await tick();
    expect(window.__c).toBeGreaterThan(base);
  });

  test("an injected [sap] root is mounted by the bridge", async () => {
    mount(`<main sap state="m=hi"><span text="state.m"></span></main>`);
    const injected = document.createElement("section");
    injected.setAttribute("sap", "");
    injected.innerHTML = `<span id="i" text="state.m"></span>`;
    injected.setAttribute("state", "m=yo");
    document.body.appendChild(injected);
    await tick(6);
    expect(injected.querySelector("#i").textContent).toBe("yo");
  });
});

describe("self-paint suppression: no loop (native, real observer)", () => {
  test("an effect that writes every pass settles to a bounded count, no E26", async () => {
    const root = mount(
      `<main sap><span id="e" effect="el.setAttribute('data-n', String((+el.getAttribute('data-n')||0)+1))"></span></main>`
    );
    root.setAttribute("data-x", "1"); // one external trigger
    await tick(8);
    const n = +root.querySelector("#e").getAttribute("data-n");
    expect(n).toBeLessThan(5); // bounded: the effect's own writes are vacuumed, no runaway
    expect(Sap.report().errors.map((e) => e.code)).not.toContain("E26");
  });
});

describe("hub backend (faithful mini-hub): no loop + pause balance", () => {
  test("the pass pauses/resumes the hub and its writes never loop back", async () => {
    installMiniHub();
    const root = mount(
      `<main sap><span id="e" effect="el.setAttribute('data-n', String((+el.getAttribute('data-n')||0)+1))"></span></main>`
    );
    expect(_activeSourceKind()).toBe("hub");
    root.setAttribute("data-x", "1"); // external trigger seen by the mini-hub observer
    await tick(8);
    const n = +root.querySelector("#e").getAttribute("data-n");
    expect(n).toBeLessThan(5);
    expect(Sap.report().errors.map((e) => e.code)).not.toContain("E26");
  });

  test("with both Mutation and undo present, the pass pauses via the hub (which bridges undo)", () => {
    const undo = { pause: jest.fn(), resume: jest.fn() };
    installMiniHub({ undo });
    mount(`<main sap state="tab=overview"><section show-when:tab="overview">o</section></main>`);
    // hub.pause()/resume() bridge undo, so undo was paused+resumed and stays balanced.
    expect(undo.pause).toHaveBeenCalled();
    expect(undo.resume).toHaveBeenCalledTimes(undo.pause.mock.calls.length);
  });
});

describe("perpetual-remount fix: disconnected apps are pruned", () => {
  test("removing an app's root prunes it from the registry on the next batch", async () => {
    const root = mount(`<main sap><span effect="window.__c = (window.__c||0)+1"></span></main>`);
    expect(Sap._registry.has(root)).toBe(true);
    root.remove();                                  // root leaves the DOM
    document.body.appendChild(document.createElement("div")); // any mutation drives a batch
    await tick();
    expect(Sap._registry.has(root)).toBe(false);    // pruned, not lingering forever
  });
});

describe("self-healing: sapjs re-reads the live DOM every pass", () => {
  test("a refresh reflects the latest external change even if a pass was missed", () => {
    const root = mount(`<main sap state="m=a"><span id="out" text="state.m"></span></main>`);
    root.setAttribute("m", "z"); // external; whether or not the bridge caught it...
    Sap.refresh();               // ...a refresh always re-derives from the live DOM
    expect(root.querySelector("#out").textContent).toBe("z");
  });
});

describe("withDomMutationPaused: degrades to no-op standalone", () => {
  test("runs fn with no source and no hyperclay, no throw", () => {
    delete window.hyperclay;
    Sap._reset(); // no active source
    let ran = false;
    expect(() => withDomMutationPaused(() => { ran = true; })).not.toThrow();
    expect(ran).toBe(true);
  });
});
