import { dropPlans } from "../src/plan.js";

// Quiet the engine's console output during tests unless a test opts in.
// Tests that assert on console can restore via jest.spyOn in the test file.
const realError = console.error;
const realWarn = console.warn;
const realLog = console.log;

beforeEach(() => {
  if (!global.__SAP_KEEP_CONSOLE__) {
    console.error = () => {};
    console.warn = () => {};
    console.log = () => {};
  }
});

afterEach(() => {
  console.error = realError;
  console.warn = realWarn;
  console.log = realLog;
});

// jsdom lacks queueMicrotask in some versions; ensure it exists.
if (typeof global.queueMicrotask !== "function") {
  global.queueMicrotask = (fn) => Promise.resolve().then(fn);
}

// A helper to flush the engine's microtask scheduler in tests. With SAP_COLD set,
// every directive plan is dropped before the scheduled pass runs, so the whole
// suite also proves the cache changes speed and never results.
global.flush = async () => {
  if (process.env.SAP_COLD) dropPlans();
  await Promise.resolve();
  await Promise.resolve();
};
