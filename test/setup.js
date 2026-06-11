// Quiet the engine's console output during tests unless a test opts in.
// Tests that assert on console can restore via jest.spyOn in the test file.
const realError = console.error;
const realLog = console.log;

beforeEach(() => {
  if (!global.__SAP_KEEP_CONSOLE__) {
    console.error = () => {};
    console.log = () => {};
  }
});

afterEach(() => {
  console.error = realError;
  console.log = realLog;
});

// jsdom lacks queueMicrotask in some versions; ensure it exists.
if (typeof global.queueMicrotask !== "function") {
  global.queueMicrotask = (fn) => Promise.resolve().then(fn);
}

// A helper to flush the engine's microtask scheduler in tests.
global.flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
