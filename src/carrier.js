// The control matrix. One Carrier per control shape: { kind, read(), write(v) }.
// Writes dispatch synthetic input + change events (the one write path) unless silent.

import { serializeControlToAttributes } from "./control-serialize.js";

function kindOf(el) {
  const tag = el.tagName;
  if (tag === "INPUT") {
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "number" || t === "range") return "number";
    if (t === "hidden") return "hidden";
    return "text";
  }
  if (tag === "TEXTAREA") return "text";
  if (tag === "SELECT") return el.multiple ? "select-multiple" : "select-one";
  return "leaf"; // contenteditable or text leaf bound via bind=
}

function readNumber(el) {
  if (el.validity && el.validity.badInput) {
    if (el.hasAttribute("value")) return Number(el.getAttribute("value")) || 0;
    return el._sapLastGood ?? 0;
  }
  if (el.value === "") return 0;
  const n = Number(el.value);
  if (Number.isNaN(n)) return el._sapLastGood ?? 0;
  el._sapLastGood = n;
  return n;
}

function readBy(el, kind) {
  switch (kind) {
    case "checkbox":
      return el.checked;
    case "radio":
      return el.checked ? el.value : undefined;
    case "number":
      return readNumber(el);
    case "select-one":
      return el.value;
    case "select-multiple":
      return [...el.selectedOptions].map((o) => o.value);
    case "hidden":
    case "text":
      return el.value;
    case "leaf":
      return el.textContent;
    default:
      return el.value;
  }
}

function writeBy(el, kind, v) {
  switch (kind) {
    case "checkbox":
      el.checked = !!v;
      break;
    case "radio":
      el.checked = String(el.value) === String(v);
      break;
    case "number":
    case "text":
    case "hidden":
      el.value = v == null ? "" : String(v);
      break;
    case "select-one":
      el.value = v == null ? "" : String(v);
      break;
    case "select-multiple": {
      const set = new Set((Array.isArray(v) ? v : [v]).map(String));
      for (const opt of el.options) opt.selected = set.has(opt.value);
      break;
    }
    case "leaf":
      el.textContent = v == null ? "" : String(v);
      break;
    default:
      el.value = v == null ? "" : String(v);
  }
}

// Mirror the live value to a serializable attribute so the saved DOM reflects state.
// Delegates the per-control rules to the shared serializer (the single source of
// truth shared with hyperclayjs persist). A transient control (search boxes,
// passwords) is never serialized: its value lives only in the live property, so
// we strip the attributes instead of writing them.
function mirror(el) {
  if (el.hasAttribute("transient")) {
    el.removeAttribute("value");
    el.removeAttribute("checked");
    el.removeAttribute("data-value");
    return;
  }
  serializeControlToAttributes(el);
}

function fire(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function carrierFor(el) {
  const kind = kindOf(el);
  return {
    el,
    kind,
    read() {
      return readBy(el, kind);
    },
    write(v, opts = {}) {
      writeBy(el, kind, v);
      if (!opts.noMirror) mirror(el);
      if (!opts.silent) fire(el);
    },
    mirror() {
      mirror(el);
    },
  };
}

export { kindOf };
