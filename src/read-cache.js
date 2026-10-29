// A bounded cache of the raw reads an intake pass makes on one item record: its
// canonical attributes and a bound leaf's text, plus each plain item row's kept object
// (pass.js handleItems), dropped on any record at or below that row. Apart from those
// rows nothing derived is kept: every value
// is a string or null straight from the DOM, and typed parsing runs again each pass,
// so a caller that mutates a parsed JSON array cannot poison the next state, and a
// control's live property is never cached. Like the directive plan cache it has its
// own document observer, because the mutation bridge may filter or pause a change.
// That observer also watches character data, which the plan cache does not: a text
// edit reports a characterData record, not an attribute one. A changed attribute
// clears that element; a character-data or child-list change clears the containing
// ancestors; an inserted subtree clears every descendant entry, which covers an edit
// made while detached. A full pass drops the whole cache (dropReads). Caching is
// enabled only inside an intake pass over a root in the observed document
// (beginReads/endReads); a shadow root, an iframe, another document, a detached tree
// or a missing MutationObserver reads straight through.

let cells = new WeakMap();
let rows = new WeakMap();
let observer = null;
let enabled = false;

export function dropReads() { cells = new WeakMap(); rows = new WeakMap(); }

function invalidate(records) {
  for (const record of records) {
    const parent = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    for (let el = parent; el; el = el.parentElement) rows.delete(el);
    if (record.type === "attributes") {
      cells.delete(record.target);
      continue;
    }
    for (let el = parent; el; el = el.parentElement) cells.delete(el);
    for (const node of record.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      cells.delete(node);
      rows.delete(node);
      for (const el of node.querySelectorAll("*")) { cells.delete(el); rows.delete(el); }
    }
  }
}

export function keepsRows() { return enabled; }
export function keptRow(el) { return enabled ? rows.get(el) : undefined; }
export function keepRow(el, entry) { if (enabled) rows.set(el, entry); }
export function forgetRow(el) { rows.delete(el); }

export function beginReads(root) {
  const previous = enabled;
  if (!observer && typeof MutationObserver === "function") {
    observer = new MutationObserver(invalidate);
    observer.observe(document, {
      attributes: true, childList: true, characterData: true, subtree: true
    });
  }
  if (observer) invalidate(observer.takeRecords());
  enabled = !!observer && root.getRootNode() === document;
  return previous;
}

export function endReads(previous) { enabled = previous; }

function cell(el) {
  let value = cells.get(el);
  if (!value) cells.set(el, value = { attrs: new Map(), hasText: false, text: "" });
  return value;
}

export function readAttr(el, name) {
  if (!enabled) return el.getAttribute(name);
  const hit = cell(el);
  if (!hit.attrs.has(name)) hit.attrs.set(name, el.getAttribute(name));
  return hit.attrs.get(name);
}

export function readText(el) {
  if (!enabled) return el.textContent;
  const hit = cell(el);
  if (!hit.hasText) {
    hit.text = el.textContent;
    hit.hasText = true;
  }
  return hit.text;
}
