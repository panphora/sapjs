// The public entry. Wires the scheduler, the Sap(el) accessor, the delegated
// action layer, the console surface, and the optional platform bridges, then
// auto-mounts every [sap] root on DOMContentLoaded.
//
//   Sap(el)          -> live write-through proxy onto el's scope/row
//   Sap.refresh()    -> synchronous full pass (set state, refresh, read on next line)
//   Sap.batch(l, fn) -> one labeled undo entry
//   Sap.status()     -> machine-readable green-line twin
//   Sap.report()     -> JSON twin of every error
//   Sap.why(el)      -> resolution inspector
//   Sap.debug(bool)  -> per-pass paint headers
//   Sap.doctor()     -> full-page audit
//   Sap.formats.x    -> register a format
//   Sap.mount(root?) -> mount a root (or all) explicitly

import { createSap, autoMount } from "./runtime.js";
import { createAccessor } from "./scope.js";
import { createActions } from "./actions.js";
import { createInput } from "./input.js";
import { addLintCheck } from "./lint.js";
import { teachForAttr } from "./teach.js";
import { addFullDebug } from "./debug-full.js";
import { registerFullFeatures } from "./features/index.js";

registerFullFeatures();

addLintCheck((el, halt, claimed) => {
  for (const a of el.attributes) {
    const teach = teachForAttr(a.name);
    if (!teach) continue;
    halt("E01", el, {
      attr: a.name, expr: a.value,
      problem: `"${a.name}" is a foreign-dialect attribute; Sap has no ${a.name.split(/[:=]/)[0]} directive`,
      fix: teach + " — or wrap the subtree in sap-ignore if intentional",
    });
    claimed(a.name);
  }
});

const { Sap, mountAll, mount, runtime } = createSap({
  createAccessor,
  debugExtras: addFullDebug,
  installInput(runtime, accessor, doc) {
    const input = createInput(runtime);
    const actions = createActions(runtime, accessor);
    input.addRouter(actions.routeInput);
    input.install(doc);
    actions.install(doc);
  },
});

const prior = typeof window !== "undefined" ? window.Sap : null;
if (prior && prior !== Sap && prior.core && typeof prior.unmount === "function") prior.unmount();

autoMount(mountAll);

if (typeof window !== "undefined") window.Sap = Sap;

export default Sap;
export { Sap, mountAll, mount, runtime };
