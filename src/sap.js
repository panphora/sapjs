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
import { registerFullFeatures } from "./features/index.js";

registerFullFeatures();

const { Sap, mountAll, mount, runtime } = createSap({
  createAccessor,
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
