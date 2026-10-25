// The intake oracle. Two equivalent fixtures run the same mutation sequence; every
// step must leave the same DOM, the same public state, the same row metadata and the
// same diagnostics. Today both sides are the same engine and one side merely has the
// canonical reads counted, so this also proves the measurement itself is inert.
// Journal 12 step 2 turns the measured side into the cached pass and keeps this file.

import { mount, Sap } from "./helpers/mount.js";
import {
  SEQUENCES, buildMarkup, countReads, pageFormat, probePasses, settle, snapshot,
} from "./helpers/intake-sequences.js";

const ROWS = 24;
const SEEDS = [1, 7];
const DECLARED_ATTRS = 5; // data-date, data-created, data-updated, data-words, data-tags

const clone = (v) => JSON.parse(JSON.stringify(v));

beforeEach(() => {
  Sap.formats.page = pageFormat;
});

afterEach(() => {
  Sap._reset();
  delete Sap.formats.page;
});

async function runFixture(count, seed, { instrument }) {
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
        await settle();
        steps.push({
          name: step.name,
          passes: probe.count(),
          reads: reads ? clone(reads.counts) : null,
          snapshot: snapshot(root, app),
        });
      }
    } finally {
      probe.restore();
    }
    return { root, mountReads, mountSnapshot, steps };
  } finally {
    if (reads) reads.restore();
  }
}

for (const seed of SEEDS) {
  test(`seed ${seed}: a measured run and a plain run agree after every step`, async () => {
    const measured = await runFixture(ROWS, seed, { instrument: true });
    const plain = await runFixture(ROWS, seed, { instrument: false });
    expect({ seed, rows: measured.mountSnapshot.rows.length }).toEqual({ seed, rows: ROWS });
    expect(measured.mountSnapshot).toEqual(plain.mountSnapshot);
    expect(measured.steps.map((s) => s.snapshot)).toEqual(plain.steps.map((s) => s.snapshot));
  });

  test(`seed ${seed}: every pass reads the canonical records`, async () => {
    const run = await runFixture(ROWS, seed, { instrument: true });
    expect({ seed, attr: run.mountReads.attr > 0 }).toEqual({ seed, attr: true });
    expect({ seed, recordText: run.mountReads.recordText >= ROWS }).toEqual({ seed, recordText: true });
    expect({ seed, presence: run.mountReads.hasAttrByName["data-pinned"] === ROWS }).toEqual({ seed, presence: true });
    for (const step of run.steps) {
      const label = { seed, step: step.name };
      expect({ ...label, passes: step.passes }).toEqual({ ...label, passes: 1 });
      expect({ ...label, attr: step.reads.attr >= ROWS * DECLARED_ATTRS }).toEqual({ ...label, attr: true });
      expect({ ...label, recordText: step.reads.recordText >= ROWS }).toEqual({ ...label, recordText: true });
      expect({ ...label, rows: step.snapshot.rows.length }).toEqual({ ...label, rows: ROWS });
    }
  });
}
