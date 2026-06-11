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

  function confirmGate(el, appRec) {
    if (!el.hasAttribute("confirm")) return true;
    const raw = el.getAttribute("confirm");
    let msg = raw;
    const entry = compile(raw);
    if (!entry.error) {
      try {
        const v = run(entry, actionCtx(el, appRec));
        if (typeof v === "string" || typeof v === "number") msg = String(v);
      } catch { /* fall back to the literal string */ }
    }
    return window.confirm(msg);
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
    if (!confirmGate(actionEl, appRec)) return;
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

  function onSubmit(e) {
    const form = e.target;
    if (!form || !form.hasAttribute || !form.hasAttribute("trigger-add")) return;
    const appRec = runtime.appFor(form);
    if (!appRec) return;
    e.preventDefault();
    if (!confirmGate(form, appRec)) return;
    const proxy = Sap(form);
    const row = proxy && proxy.$add(form.getAttribute("trigger-add"));
    if (row) focusFirstEditable(row.$el);
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
