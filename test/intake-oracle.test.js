// The intake oracle. Two equivalent fixtures run the same mutation sequence; every
// step must leave the same DOM, the same public state, the same row metadata, the
// same diagnostics and the same effects, and a pass with the read cache disabled
// must produce the same output as the cached pass. The read counts pin what the cache
// actually reuses: an unchanged record costs no attribute or text read, an edited one
// costs exactly its own, and a full pass rereads every canonical record.

import { mount, Sap } from "./helpers/mount.js";
import { runPass } from "../src/pass.js";
import {
  SEQUENCES, buildMarkup, countReads, pageFormat, probePasses, settle, snapshot,
} from "./helpers/intake-sequences.js";

const ROWS = 24;
const SEEDS = [1, 7];
const DECLARED_ATTRS = 5; // data-date, data-created, data-updated, data-words, data-tags
const RECORD_ATTRS = ["data-date", "data-created", "data-updated", "data-words", "data-tags"];

// What the cache must do on the shared sequence: the body edit clears the containing
// record (its five declared attributes and its body text), a control edit touches no
// record, and a structural replacement or a full pass rereads everything.
const EXPECTED = {
  "body edit": { attr: DECLARED_ATTRS, text: 1 },
  "control edit": { attr: 0, text: 0 },
  "structural replacement": { attr: ROWS * DECLARED_ATTRS, text: ROWS },
  "full refresh": { attr: ROWS * DECLARED_ATTRS, text: ROWS },
};

const clone = (v) => JSON.parse(JSON.stringify(v));

function recordAttrs(counts) {
  let n = 0;
  for (const name of RECORD_ATTRS) n += counts.attrByName[name] || 0;
  return n;
}

function effectsOf(app) {
  const s = app._stats;
  return {
    stats: s ? { fields: s.fields, calcs: s.calcs, paints: s.paints, lists: s.lists, writes: s.writes, viewWrites: s.viewWrites } : null,
    trigger: app._lastPass ? app._lastPass.trigger : null,
    state: Object.keys(app._state || {}).sort(),
  };
}

async function runFixture(count, seed, { instrument, explicitPass = null }) {
  const reads = instrument ? countReads() : null;
  try {
    const root = mount(buildMarkup(count, seed)); // the mount pass runs inside mount()
    const app = Sap._registry.get(root);
    const mountReads = reads ? clone(reads.counts) : null;
    const mountSnapshot = snapshot(root, app);
    const probe = probePasses();
    Sap.debug(true);
    const steps = [];
    try {
      for (const step of SEQUENCES[0].steps) {
        if (reads) reads.reset();
        probe.reset();
        step.apply({ root, count, seed, doc: document });
        let immediate = null;
        if (explicitPass) {
          runPass(app, { ...explicitPass });
          immediate = snapshot(root, app);
        }
        await settle();
        steps.push({
          name: step.name,
          passes: probe.count(),
          reads: reads ? clone(reads.counts) : null,
          immediate,
          effects: effectsOf(app),
          snapshot: snapshot(root, app),
        });
      }
      if (reads) reads.reset();
      probe.reset();
      Sap.refresh();
      steps.push({
        name: "full refresh",
        passes: probe.count(),
        reads: reads ? clone(reads.counts) : null,
        immediate: null,
        effects: effectsOf(app),
        snapshot: snapshot(root, app),
      });
    } finally {
      probe.restore();
    }
    return { root, mountReads, mountSnapshot, steps };
  } finally {
    if (reads) reads.restore();
  }
}

const shape = (run) => ({
  mount: run.mountSnapshot,
  steps: run.steps.map((s) => ({ immediate: s.immediate, effects: s.effects, snapshot: s.snapshot })),
});

beforeEach(() => {
  Sap.formats.page = pageFormat;
});

afterEach(() => {
  Sap._reset();
  delete Sap.formats.page;
});

for (const seed of SEEDS) {
  test(`seed ${seed}: a measured run and a plain run agree after every step`, async () => {
    const measured = await runFixture(ROWS, seed, { instrument: true });
    const plain = await runFixture(ROWS, seed, { instrument: false });
    expect({ seed, rows: measured.mountSnapshot.rows.length }).toEqual({ seed, rows: ROWS });
    expect(shape(measured)).toEqual(shape(plain));
  });

  test(`seed ${seed}: a cached run and an uncached run agree after every step`, async () => {
    const cached = await runFixture(ROWS, seed, { instrument: true, explicitPass: {} });
    const uncached = await runFixture(ROWS, seed, { instrument: true, explicitPass: { cacheReads: false } });
    expect(shape(cached)).toEqual(shape(uncached));
    for (const step of uncached.steps) {
      const label = { seed, step: step.name };
      expect({ ...label, text: step.reads.recordText >= ROWS }).toEqual({ ...label, text: true });
      expect({ ...label, attr: recordAttrs(step.reads) >= ROWS * DECLARED_ATTRS }).toEqual({ ...label, attr: true });
    }
  });

  test(`seed ${seed}: the cache reads only changed records and rereads all on a full pass`, async () => {
    const run = await runFixture(ROWS, seed, { instrument: true });
    expect({ seed, attr: run.mountReads.attr > 0 }).toEqual({ seed, attr: true });
    expect({ seed, recordText: run.mountReads.recordText >= ROWS }).toEqual({ seed, recordText: true });
    expect({ seed, presence: run.mountReads.hasAttrByName["data-pinned"] === ROWS }).toEqual({ seed, presence: true });
    expect({ seed, passes: run.steps.length }).toEqual({ seed, passes: Object.keys(EXPECTED).length });
    for (const step of run.steps) {
      const label = { seed, step: step.name };
      const want = EXPECTED[step.name];
      expect({ ...label, passes: step.passes }).toEqual({ ...label, passes: 1 });
      expect({ ...label, text: step.reads.recordText }).toEqual({ ...label, text: want.text });
      expect({ ...label, attr: recordAttrs(step.reads) }).toEqual({ ...label, attr: want.attr });
      expect({ ...label, presence: step.reads.hasAttrByName["data-pinned"] }).toEqual({ ...label, presence: ROWS });
      expect({ ...label, rows: step.snapshot.rows.length }).toEqual({ ...label, rows: ROWS });
    }
    const edited = run.steps[0].snapshot;
    expect({ seed, edited: edited.html.includes("Edited row") }).toEqual({ seed, edited: true });
    expect({ seed, typed: edited.rows.some((r) => r.state.body.includes("A line the page typed.")) }).toEqual({ seed, typed: true });
  });
}
