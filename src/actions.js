// Delegated event handling, attached once at document. This is the entire input
// surface: a control change schedules a pass (the keystroke -> recompute path),
// a click on an action element runs one action (innermost wins), a form submit
// runs trigger-add, native reset replays synthetic events, details toggle recomputes,
// and a detail projection's edit writes through to its source row.

import {
  nearestScopeEl, nearestItemEl, isInsideDetail, ownedBind, rowsOf,
  resolveListEl, walkOwned,
} from "./dom.js";
import { carrierFor } from "./carrier.js";
import { serializeControlToAttributes } from "./control-serialize.js";
import { regionSkipsSave, platformConsent } from "./platform.js";
import { compile, run } from "./compile.js";

const TRIGGER_WORDS = ["trigger-add", "trigger-remove", "trigger-reset"];

function hasAction(el) {
  if (el.nodeType !== 1) return false;
  for (const a of el.attributes) {
    const n = a.name;
    if (n.startsWith("set:") || n.startsWith("move:") || n.startsWith("sort:")) return true;
    if (TRIGGER_WORDS.includes(n)) return true;
  }
  return false;
}

function findActionEl(target, root) {
  let el = target;
  const stop = root.parentElement;
  while (el && el !== stop) {
    if (el.nodeType === 1) {
      // forms own trigger-add via submit, not click
      if (hasAction(el) && !(el.tagName === "FORM" && el.hasAttribute("trigger-add"))) return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function createActions(runtime, accessor) {
  const { Sap } = accessor;

  function actionCtx(el, appRec) {
    let item = null;
    const detailEl = isInsideDetail(el);
    if (detailEl && detailEl._sapDetailRow) item = detailEl._sapDetailRow._sapScope || null;
    else {
      const itemEl = nearestItemEl(el);
      if (itemEl && itemEl.hasAttribute("item")) item = itemEl._sapScope || null;
    }
    const scopeEl = nearestScopeEl(el) || appRec.root;
    const state = scopeEl._sapScope || appRec._state || {};
    return { state, item, el, root: appRec._state || {} };
  }

  // Gate an action behind a `confirm` attribute, then run it. With no confirm
  // attribute the action runs immediately. Standalone, this blocks on the native
  // window.confirm and runs synchronously in the same tick (unchanged behavior).
  // On the platform, it uses the themed window.hyperclay.consent dialog, which fires
  // its callback on confirm; because that dialog does not block the page like
  // window.confirm does, a per-element guard prevents a second click from opening a
  // second dialog (or double-running the action) while one is pending.
  function gateThenRun(el, appRec, proceed) {
    if (!el.hasAttribute("confirm")) { proceed(); return; }
    const raw = el.getAttribute("confirm");
    let msg = raw;
    const entry = compile(raw);
    if (!entry.error) {
      try {
        const v = run(entry, actionCtx(el, appRec));
        if (typeof v === "string" || typeof v === "number") msg = String(v);
      } catch { /* fall back to the literal string */ }
    }
    const consent = platformConsent();
    if (!consent) { if (window.confirm(msg)) proceed(); return; }
    if (el._sapGatePending) return;
    el._sapGatePending = true;
    const done = () => { el._sapGatePending = false; };
    consent(msg, () => { done(); proceed(); }).catch(done);
  }

  function runSet(el, appRec) {
    for (const a of el.attributes) {
      if (!a.name.startsWith("set:")) continue;
      const field = a.name.slice(4);
      const entry = compile(a.value);
      if (entry.error) {
        appRec.diag.error("E08", el, { attr: a.name, expr: a.value, problem: String(entry.error.message) });
        continue;
      }
      let value;
      try {
        value = run(entry, actionCtx(el, appRec));
      } catch (err) {
        appRec.diag.error("E24", el, { attr: a.name, expr: a.value, problem: String(err.message) });
        continue;
      }
      const proxy = Sap(el);
      if (proxy) proxy[field] = value;
    }
  }

  function moveStep(el, dir) {
    const row = el.closest("[item]");
    if (!row) return;
    const siblings = rowsOf(row.parentElement);
    const i = siblings.indexOf(row);
    if (dir === "up" && i > 0) runtime.placeBefore(row, siblings[i - 1]);
    else if (dir === "down" && i < siblings.length - 1) runtime.placeBefore(siblings[i + 1], row);
  }

  function resolveSortList(el, value, appRec) {
    if (value) return resolveListEl(appRec.root, el, value);
    let cur = el;
    while (cur) {
      if (cur.hasAttribute && cur.hasAttribute("items")) return cur;
      cur = cur.parentElement;
    }
    const scopeEl = nearestScopeEl(el) || appRec.root;
    const lists = [];
    walkOwned(scopeEl, (e) => { if (e.hasAttribute("items")) lists.push(e); });
    return lists[0] || null;
  }

  function cmp(a, b) {
    const ea = a == null || a === "";
    const eb = b == null || b === "";
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }

  function runSort(el, field, value, appRec) {
    const listEl = resolveSortList(el, value, appRec);
    if (!listEl) {
      appRec.diag.error("E17", el, { attr: "sort:" + field, problem: `no items list resolvable for sort:${field}` });
      return;
    }
    const rows = rowsOf(listEl);
    const valOf = (r) => (r._sapScope ? r._sapScope[field] : undefined);
    const asc = [...rows].sort((a, b) => cmp(valOf(a), valOf(b)));
    const isAsc = asc.every((r, i) => r === rows[i]);
    const ordered = isAsc ? [...asc].reverse() : asc;
    for (const r of ordered) runtime.moveInto(listEl, r);
    runtime.schedule(appRec, "sort:" + field);
  }

  function focusFirstEditable(rowEl) {
    if (!rowEl || rowEl.hidden) return;
    const f = rowEl.querySelector("[bind]:not([type=hidden]), [contenteditable]");
    if (f && typeof f.focus === "function") f.focus();
  }

  function runAction(actionEl, appRec) {
    gateThenRun(actionEl, appRec, () => {
      const proxy = Sap(actionEl);
      for (const a of [...actionEl.attributes]) {
        const n = a.name;
        if (n === "trigger-remove") proxy && proxy.$remove();
        else if (n === "trigger-reset") proxy && proxy.$reset();
        else if (n === "trigger-add") {
          const row = proxy && proxy.$add(a.value);
          if (row) focusFirstEditable(row.$el);
        }
        else if (n === "move:up") { moveStep(actionEl, "up"); runtime.schedule(appRec, "move:up"); }
        else if (n === "move:down") { moveStep(actionEl, "down"); runtime.schedule(appRec, "move:down"); }
        else if (n.startsWith("move:to")) proxy && proxy.$move(a.value);
        else if (n.startsWith("sort:")) runSort(actionEl, n.slice(5), a.value, appRec);
      }
      if ([...actionEl.attributes].some((a) => a.name.startsWith("set:"))) runSet(actionEl, appRec);
    });
  }

  function onClick(e) {
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    const appRec = runtime.appFor(t);
    if (!appRec) return;
    const actionEl = findActionEl(t, appRec.root);
    if (!actionEl) return;
    runAction(actionEl, appRec);
  }

  function clearControl(c) {
    const cr = carrierFor(c);
    const def = c.getAttribute("default");
    if (cr.kind === "checkbox") cr.write(def === "" || def === "true");
    else cr.write(def != null ? def : "");
  }

  // A <form trigger-add="list"> composes the new row from its own fields: clone
  // the template, copy each of the form's bound controls into the new row's
  // field of the same name, clear the form, and refocus for rapid entry.
  function addFromForm(formEl, appRec, listName) {
    const proxy = Sap(formEl);
    if (!proxy) return;
    const newRow = proxy.$add(listName);
    if (!newRow) return;
    const composers = [];
    walkOwned(formEl, (el) => { if (el.hasAttribute("bind")) composers.push(el); });
    for (const c of composers) {
      const target = ownedBind(newRow.$el, c.getAttribute("bind"));
      if (target) carrierFor(target).write(carrierFor(c).read());
    }
    composers.forEach(clearControl);
    if (composers.length) {
      if (typeof composers[0].focus === "function") composers[0].focus();
    } else {
      focusFirstEditable(newRow.$el);
    }
  }

  function onSubmit(e) {
    const form = e.target;
    if (!form || !form.hasAttribute || !form.hasAttribute("trigger-add")) return;
    const appRec = runtime.appFor(form);
    if (!appRec) return;
    e.preventDefault();
    gateThenRun(form, appRec, () => addFromForm(form, appRec, form.getAttribute("trigger-add")));
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
    const detailEl = isInsideDetail(t);
    if (detailEl && detailEl._sapDetailRow && t.hasAttribute("bind")) {
      const src = ownedBind(detailEl._sapDetailRow, t.getAttribute("bind"));
      if (src && src !== t) {
        carrierFor(src).write(carrierFor(t).read());
        return;
      }
    }
    runtime.schedule(appRec, e.type + " " + (t.id || t.tagName.toLowerCase()));
  }

  function install(doc = document) {
    doc.addEventListener("click", onClick);
    doc.addEventListener("submit", onSubmit);
    doc.addEventListener("reset", onReset);
    doc.addEventListener("toggle", onToggle, true);
    doc.addEventListener("input", onInput);
    doc.addEventListener("change", onInput);
  }

  return { install };
}
