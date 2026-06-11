// The only door to a pass. A burst of N synthetic events coalesces into ONE
// microtask pass (the `queued` flag is the transaction). The circuit breaker
// stops runaway recompute loops and names the culprit from a trigger ring.

const MAX_PASSES = 50; // per macrotask, per app; a true loop trips this

export function createScheduler(runPass) {
  let queued = false;
  const dirty = new Set();
  const ring = []; // recent trigger descriptions, for the breaker message

  function note(trigger) {
    if (!trigger) return;
    ring.push(trigger);
    if (ring.length > 8) ring.shift();
  }

  function schedule(app, trigger) {
    note(trigger);
    if (app._broken) return;
    dirty.add(app);
    if (queued) return;
    queued = true;
    queueMicrotask(drain);
  }

  function drain() {
    queued = false;
    const apps = [...dirty];
    dirty.clear();
    for (const app of apps) runWithBreaker(app);
  }

  function runWithBreaker(app) {
    if (app._broken) return;
    app._passes = (app._passes || 0) + 1;
    if (app._passes > MAX_PASSES) {
      app._broken = true;
      app._breakerRing = ring.slice();
      runPass(app, { breaker: true });
      return;
    }
    if (!app._resetArmed) {
      app._resetArmed = true;
      setTimeout(() => {
        app._passes = 0;
        app._resetArmed = false;
      }, 0);
    }
    runPass(app);
  }

  // Synchronous pass (Sap.refresh / livesync resync). Still breaker-guarded.
  function runNow(app, trigger) {
    note(trigger);
    runWithBreaker(app);
  }

  function rearm(app) {
    app._broken = false;
    app._passes = 0;
  }

  return { schedule, runNow, rearm, ring };
}
