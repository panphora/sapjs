// node scripts/measure-intake.mjs 50 1000 5000
//
// Diagnosis only: how many canonical record reads does one intake pass repeat?
// The fixture is test/helpers/intake-sequences.js (seven fields per record, a bind=
// body carrier, a paged each= projection). Each size runs the shared sequence twice:
// once with Element.prototype.getAttribute, hasAttribute and the textContent getter
// wrapped to count reads (restored afterwards), and once plain for the timings, so
// the instrumented numbers never inflate the elapsed milliseconds.

import { JSDOM } from "jsdom";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = "/Users/davidmiranda/Documents/GitHub/hyper/plans/starter-templates/journal-template/seats/replan-m7-m9/intake-baseline.json";

const sizes = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
if (!sizes.length) sizes.push(50, 1000, 5000);

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
for (const key of ["window", "document", "Node", "Element", "HTMLElement", "MutationObserver", "CustomEvent", "Event", "getComputedStyle"]) {
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
}

const { default: Sap } = await import("../src/sap.js");
const seq = await import("../test/helpers/intake-sequences.js");
Sap.formats.page = seq.pageFormat;

const jsdomVersion = JSON.parse(await readFile(join(HERE, "..", "node_modules", "jsdom", "package.json"), "utf8")).version;

function mountFixture(count, seed) {
  Sap._reset();
  document.body.innerHTML = seq.buildMarkup(count, seed);
  const root = document.querySelector("[sap]");
  const app = Sap.mount(root);
  return { root, app };
}

const clone = (v) => JSON.parse(JSON.stringify(v));

async function runSequence(count, seed, { instrument }) {
  const reads = instrument ? seq.countReads() : null;
  let probe = null;
  try {
    const t0 = performance.now();
    const { root, app } = mountFixture(count, seed);
    const mountMs = performance.now() - t0;
    const mountReads = reads ? clone(reads.counts) : null;
    const mountRows = root.querySelectorAll("#entries > article.entry").length;
    const mountSnapshot = seq.snapshot(root, app);
    probe = seq.probePasses();
    Sap.debug(true);
    const steps = [];
    for (const step of seq.SEQUENCES[0].steps) {
      if (reads) reads.reset();
      probe.reset();
      const start = performance.now();
      step.apply({ root, count, seed, doc: document });
      await seq.settle();
      const ms = performance.now() - start;
      const snapshot = seq.snapshot(root, app);
      steps.push({
        name: step.name,
        ms: round(ms),
        passes: probe.count(),
        rows: snapshot.rows.length,
        reads: reads ? clone(reads.counts) : null,
        snapshot,
      });
    }
    return { mountMs: round(mountMs), mountReads, mountRows, mountSnapshot, steps };
  } finally {
    if (probe) probe.restore();
    if (reads) reads.restore();
  }
}

function round(ms) {
  return Math.round(ms * 10) / 10;
}

function readsPerPass(reads, passes) {
  if (!reads || !passes) return 0;
  return round((reads.attr + reads.text) / passes);
}

// The reads that belong to the record itself: its five declared value attributes,
// its presence attribute, and its bind= body carrier text.
const RECORD_ATTRS = ["data-date", "data-created", "data-updated", "data-words", "data-tags"];
const RECORD_PRESENCE = ["data-pinned"];

function recordReads(reads) {
  let n = reads.recordText;
  for (const a of RECORD_ATTRS) n += reads.attrByName[a] || 0;
  for (const a of RECORD_PRESENCE) n += reads.hasAttrByName[a] || 0;
  return n;
}

function recordPerPass(reads, passes) {
  if (!reads || !passes) return 0;
  return round(recordReads(reads) / passes);
}

// sap\'s own green line and debug header would otherwise interrupt the tables.
function silenceSapLines() {
  const original = console.log;
  console.log = (...args) => {
    const s = args[0];
    if (typeof s === "string" && s.startsWith("sap ") && (s.startsWith("sap \u2713") || s.startsWith("sap \u2717") || s.startsWith("sap debug"))) return;
    original.apply(console, args);
  };
  return () => {
    console.log = original;
  };
}

function column(text, width) {
  return String(text).padEnd(width);
}

function printTable(size, rows) {
  const header = [column("scenario", 24), column("rows", 6), column("passes", 7), column("attrReads", 10), column("textReads", 10), column("record/pass", 12), column("reads/pass", 11), column("ms", 8)];
  console.log(`\n${size} rows`);
  console.log(header.join(""));
  for (const r of rows) {
    console.log(
      [
        column(r.scenario, 24),
        column(r.rows, 6),
        column(r.passes, 7),
        column(r.attrReads, 10),
        column(r.textReads, 10),
        column(r.recordPerPass, 12),
        column(r.readsPerPass, 11),
        column(r.ms, 8),
      ].join("")
    );
  }
}

const baseline = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  jsdom: jsdomVersion,
  fixture: "seven declared fields per record (five attributes + one presence) plus a bind= body carrier, and a paged each= projection of 20 rows",
  sizes: [],
};

let failed = false;

for (const size of sizes) {
  const seed = 1;
  const restoreLog = silenceSapLines();
  const measured = await runSequence(size, seed, { instrument: true }).finally(restoreLog);
  const restoreLog2 = silenceSapLines();
  const timed = await runSequence(size, seed, { instrument: false }).finally(restoreLog2);

  const sameMount = JSON.stringify(measured.mountSnapshot) === JSON.stringify(timed.mountSnapshot);
  const sameSteps = JSON.stringify(measured.steps.map((s) => s.snapshot)) === JSON.stringify(timed.steps.map((s) => s.snapshot));
  if (!sameMount || !sameSteps) {
    failed = true;
    console.error(`${size} rows: the instrumented run diverged from the plain run (mount ${sameMount}, steps ${sameSteps})`);
  }

  const rows = [
    {
      scenario: "mount",
      rows: measured.mountRows,
      passes: 1,
      attrReads: measured.mountReads.attr,
      textReads: measured.mountReads.text,
      readsPerPass: readsPerPass(measured.mountReads, 1),
      recordPerPass: recordPerPass(measured.mountReads, 1),
      ms: timed.mountMs,
      reads: measured.mountReads,
    },
  ];
  measured.steps.forEach((step, i) => {
    const plain = timed.steps[i];
    rows.push({
      scenario: step.name,
      rows: step.rows,
      passes: step.passes,
      attrReads: step.reads.attr,
      textReads: step.reads.text,
      readsPerPass: readsPerPass(step.reads, step.passes),
      recordPerPass: recordPerPass(step.reads, step.passes),
      ms: plain.ms,
      reads: step.reads,
    });
    if (step.passes !== plain.passes) {
      failed = true;
      console.error(`${size} rows / ${step.name}: pass counts differ (measured ${step.passes}, plain ${plain.passes})`);
    }
  });

  for (const r of rows) {
    if (!r.rows || !r.passes || !r.attrReads || !r.textReads) {
      failed = true;
      console.error(`${size} rows / ${r.scenario}: expected nonzero rows, passes, attribute reads and text reads (${JSON.stringify({ rows: r.rows, passes: r.passes, attrReads: r.attrReads, textReads: r.textReads })})`);
    }
  }

  printTable(size, rows);
  baseline.sizes.push({ size, seed, rows });
}

const text = JSON.stringify(baseline, null, 2) + "\n";
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, text);
console.log(`\nbaseline written to ${OUT}`);
if (failed) process.exitCode = 1;
