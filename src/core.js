// The sapjs core: declared records (bind, state=, items/item) and the
// presentations derived from them (text, show, attr:, class:, css:, the show-when
// family). Built from the same source as full sapjs. Markup that needs more is a
// mount error naming full sapjs, and loading full sapjs needs no markup change.

import { createSap, autoMount } from "./runtime.js";
import { createInput } from "./input.js";
import { addLintCheck } from "./lint.js";
import { registerFeature } from "./pass.js";
import { setBeacon } from "./errors.js";

export const FULL_SAPJS = "https://clayjs.com/v1/sap.js";

const NEEDS_FULL_PREFIX = /^(calc|set|move|sort):/;
const NEEDS_FULL_BARE = new Set([
  "each", "detail", "effect", "invalid", "confirm", "trigger-add", "trigger-remove", "trigger-reset",
]);

export function needsFullSapjs(name) {
  return NEEDS_FULL_PREFIX.test(name) || NEEDS_FULL_BARE.has(name);
}

addLintCheck((el, halt) => {
  for (const a of el.attributes) {
    if (!needsFullSapjs(a.name)) continue;
    halt("E50", el, {
      attr: a.name, expr: a.value,
      problem: `${a.name} is full sapjs; the sapjs core only paints declared state`,
      fix: `load ${FULL_SAPJS}; the markup stays as it is`,
    });
  }
});

// Markup that arrives after mount (a merge, a script) never reaches the lint, so the
// pass flags it too: the element gets a beacon and the app an error, never a
// silent difference.
function unsupported(pass, el, what) {
  pass.app.diag.error("E50", el, {
    attr: what,
    problem: `${what} is full sapjs; the sapjs core only paints declared state`,
    fix: `load ${FULL_SAPJS}; the markup stays as it is`,
  });
  setBeacon(el, "E50");
}

registerFeature({
  name: "core-only",
  collect(pass, el, plan) {
    if (plan.calcs) unsupported(pass, el, "calc:" + plan.calcs[0].name);
    if (plan.effects) unsupported(pass, el, "effect");
    if (plan.invalids) unsupported(pass, el, "invalid");
  },
  boundary: {
    each(pass, el) { unsupported(pass, el, "each"); },
    detail(pass, el) { unsupported(pass, el, "detail"); },
  },
});

function createAccessor() {
  const Sap = function Sap() {
    throw new Error(`Sap(el) is full sapjs; load ${FULL_SAPJS}`);
  };
  return { Sap };
}

const fullOnly = (name) => () => {
  console.warn(`Sap.${name} is full sapjs; load ${FULL_SAPJS}`);
  return null;
};

const { Sap, mountAll, mount, runtime } = createSap({
  createAccessor,
  debugExtras: () => ({ why: fullOnly("why"), doctor: fullOnly("doctor") }),
  installInput(runtime, accessor, doc) {
    createInput(runtime).install(doc);
  },
});

Sap.core = true;

const fullSapjs = typeof window !== "undefined" && window.Sap && !window.Sap.core;
if (fullSapjs) Sap.unmount();
else autoMount(mountAll);

if (typeof window !== "undefined" && !window.Sap) window.Sap = Sap;

export default Sap;
export { Sap, mountAll, mount, runtime };
