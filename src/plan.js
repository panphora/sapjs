// An element's directive plan: its Sap attributes parsed once. A pass reads the plan
// instead of scanning attributes. The plan holds nothing the attributes do not, so
// it is dropped whenever the page changes them, by any means: a MutationObserver of
// its own on the whole document clears an element's plan on any attribute record,
// and every plan in a subtree when that subtree is inserted (an element edited while
// detached reports nothing until it comes back). It is separate from the mutation
// bridge on purpose: a hub filters some regions out of its feed, and the bridge's
// backend can change mid-session. A pass drains it first (beginPlans), so a change made
// in the same task as the event that scheduled the pass is never read from an old
// plan, and drains it again after placing rows (drainPlans), since inserting an element
// can run page code that edits attributes. A pass that cannot attribute a change
// (refresh, live sync, undo, mount) drops every plan with dropPlans(). Plans are kept
// only for an app whose root sits in the observed document: a shadow root, an iframe,
// another document or a detached tree is invisible to the observer, so its plans are
// built fresh on every read. Without a MutationObserver nothing is cached.

import { parseStateDecl } from "./dom.js";
import { compile } from "./compile.js";

let planGen = {};
let watcher = null;
let canWatch = true;
let cacheable = false;

export function dropPlans() {
  planGen = {};
}

// Called at the start of a pass over the app rooted at `root`; returns what endPlans
// restores when the pass ends.
export function beginPlans(root) {
  const prev = cacheable;
  if (watcher) clearFromRecords(watcher.takeRecords());
  else if (canWatch) watchPlans();
  cacheable = !!watcher && root.getRootNode() === document;
  return prev;
}

export function endPlans(prev) {
  cacheable = prev;
}

export function drainPlans() {
  if (watcher) clearFromRecords(watcher.takeRecords());
}

function watchPlans() {
  if (typeof document === "undefined" || typeof MutationObserver !== "function") {
    canWatch = false;
    return;
  }
  watcher = new MutationObserver(clearFromRecords);
  watcher.observe(document, { attributes: true, childList: true, subtree: true });
}

function clearFromRecords(records) {
  for (const rec of records) {
    if (rec.type === "attributes") {
      if (rec.target._sapPlan) rec.target._sapPlan = null;
    } else {
      for (const node of rec.addedNodes) if (node.nodeType === 1) clearTree(node);
    }
  }
}

function clearTree(el) {
  if (el._sapPlan) el._sapPlan = null;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) clearTree(c);
}

export function planOf(el) {
  if (!cacheable) return buildPlan(el);
  const p = el._sapPlan;
  if (p && p.gen === planGen) return p;
  return (el._sapPlan = buildPlan(el));
}

function buildPlan(el) {
  const plan = {
    gen: planGen,
    inert: el.tagName === "TEMPLATE",
    template: false,
    cms: false,
    item: false,
    scope: false, items: false, detail: false, each: false,
    boundary: null,
    bind: null,
    transient: false,
    decls: null,
    calcs: null,
    paints: null,
    effects: null,
    invalids: null,
  };
  for (const attr of el.attributes) {
    const name = attr.name;
    const val = attr.value;
    const colon = name.indexOf(":");
    if (colon < 0) {
      switch (name) {
        case "sap-ignore": plan.inert = true; break;
        case "cms-template": plan.inert = true; plan.cms = true; break;
        case "template": plan.inert = true; plan.template = true; break;
        case "item": plan.item = true; break;
        case "scope": plan.scope = true; break;
        case "items": plan.items = true; break;
        case "detail": plan.detail = true; break;
        case "each": plan.each = true; break;
        case "bind": plan.bind = val; break;
        case "transient": plan.transient = true; break;
        case "state": plan.decls = parseStateDecl(val); break;
        case "text": (plan.paints || (plan.paints = [])).push({ kind: "text", fmt: null, entry: compile(val) }); break;
        case "show": (plan.paints || (plan.paints = [])).push({ kind: "show", entry: compile(val) }); break;
        case "effect": (plan.effects || (plan.effects = [])).push({ entry: compile(val, true) }); break;
        case "invalid": (plan.invalids || (plan.invalids = [])).push({ entry: compile(val) }); break;
      }
      continue;
    }
    const head = name.slice(0, colon);
    const tail = name.slice(colon + 1);
    switch (head) {
      case "calc": (plan.calcs || (plan.calcs = [])).push({ name: tail, entry: compile(val) }); break;
      case "text": (plan.paints || (plan.paints = [])).push({ kind: "text", fmt: tail, entry: compile(val) }); break;
      case "attr": (plan.paints || (plan.paints = [])).push({ kind: "attr", arg: tail, entry: compile(val) }); break;
      case "class": (plan.paints || (plan.paints = [])).push({ kind: "class", arg: tail, entry: compile(val) }); break;
      case "css": (plan.paints || (plan.paints = [])).push({ kind: "css", arg: tail, entry: compile(val) }); break;
      case "show-when": case "option": (plan.paints || (plan.paints = [])).push({ kind: "when", match: "show", field: tail, values: val.split("|") }); break;
      case "hide-when": (plan.paints || (plan.paints = [])).push({ kind: "when", match: "hide", field: tail, values: val.split("|") }); break;
      case "option-not": (plan.paints || (plan.paints = [])).push({ kind: "when", match: "show-not", field: tail, values: val.split("|") }); break;
    }
  }
  plan.boundary = plan.scope ? "scope" : plan.items ? "items" : plan.detail ? "detail" : plan.each ? "each" : null;
  return isEmpty(plan) ? emptyPlan() : plan;
}

// Most elements carry no directive. They all share one frozen plan per generation
// instead of holding one each.
let empty = null;

function emptyPlan() {
  if (!empty || empty.gen !== planGen) {
    empty = Object.freeze({
      gen: planGen,
      inert: false, template: false, cms: false, item: false,
      scope: false, items: false, detail: false, each: false,
      boundary: null, bind: null, transient: false,
      decls: null, calcs: null, paints: null, effects: null, invalids: null,
    });
  }
  return empty;
}

function isEmpty(plan) {
  return !plan.inert && !plan.item && plan.boundary === null && plan.bind === null && !plan.transient &&
    !plan.decls && !plan.calcs && !plan.paints && !plan.effects && !plan.invalids;
}
