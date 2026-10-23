// The input surface every entry needs: a control edit schedules a pass (the
// keystroke -> recompute path), a [persist] control mirrors its value to the file,
// native reset replays synthetic events, details toggle and sortable drags
// recompute, and arrow keys step a bound numeric text field. The full entry adds
// routers (each-row and detail write-through) that may claim an edit first.

import { carrierFor } from "./carrier.js";
import { num } from "./helpers.js";
import { serializeControlToAttributes } from "./control-serialize.js";
import { regionSkipsSave } from "./platform.js";

export function createInput(runtime) {
  const routers = [];

  function onInput(e) {
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    const appRec = runtime.appFor(t);
    if (!appRec) return;
    // Opt-in durability: a [persist] control mirrors its live value to a
    // serializable attribute on every edit, so a typed value survives a save
    // even without the host platform. bind is reactivity; persist is durability.
    // Skip in a no-save / frozen region: the platform strips those bytes anyway.
    if (t.hasAttribute("persist") && !regionSkipsSave(t)) serializeControlToAttributes(t);
    for (const route of routers) if (route(t, appRec)) return;
    runtime.schedule(appRec, e.type + " " + (t.id || t.tagName.toLowerCase()));
  }

  function onReset(e) {
    const form = e.target;
    const appRec = runtime.appFor(form);
    if (!appRec) return;
    // native reset restores values BEFORE the event; defer so we read post-reset.
    setTimeout(() => {
      form.querySelectorAll("[bind]").forEach((c) => {
        c.dispatchEvent(new Event("input", { bubbles: true }));
        c.dispatchEvent(new Event("change", { bubbles: true }));
      });
      runtime.schedule(appRec, "reset");
    }, 0);
  }

  function onToggle(e) {
    const appRec = runtime.appFor(e.target);
    if (appRec) runtime.schedule(appRec, "toggle");
  }

  // A hyperclay `sortable` drag reorder announces itself with a dedicated event.
  // Re-derive both lists it touched (same-list drag: from === to; cross-list: two
  // apps). schedule() dedups per app, so overlapping targets are still one pass.
  function onSorted(e) {
    const d = e.detail || {};
    for (const el of [d.from, d.to, e.target]) {
      if (!el || el.nodeType !== 1) continue;
      const appRec = runtime.appFor(el);
      if (appRec) runtime.schedule(appRec, "sorted");
    }
  }

  function onKeydown(e) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const t = e.target;
    if (!t || t.nodeType !== 1 || t.tagName !== "INPUT") return;
    if (!t.hasAttribute("bind") || !t.hasAttribute("step")) return;
    const type = (t.getAttribute("type") || "text").toLowerCase();
    if (type !== "text" && type !== "tel" && type !== "search") return; // native numeric types already step
    const appRec = runtime.appFor(t);
    if (!appRec) return;
    e.preventDefault();
    const step = num(t.getAttribute("step")) || 1;
    const dir = e.key === "ArrowUp" ? 1 : -1;
    let next = num(t.value) + step * (e.shiftKey ? 10 : 1) * dir;
    const min = t.getAttribute("min"), max = t.getAttribute("max");
    if (min !== null && min !== "" && next < num(min)) next = num(min);
    if (max !== null && max !== "" && next > num(max)) next = num(max);
    carrierFor(t).write(String(Number(next.toFixed(2))));
  }

  function install(doc = document) {
    doc.addEventListener("reset", onReset);
    doc.addEventListener("toggle", onToggle, true);
    doc.addEventListener("input", onInput);
    doc.addEventListener("change", onInput);
    doc.addEventListener("clay:sorted", onSorted);
    doc.addEventListener("keydown", onKeydown);
  }

  return { install, addRouter: (fn) => routers.push(fn) };
}
