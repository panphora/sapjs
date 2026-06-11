import Sap from "../../src/sap.js";

// Mount the first [app] in a fresh document body and return its root element.
export function mount(html) {
  document.body.innerHTML = html;
  Sap._reset();
  const root = document.querySelector("[app]");
  Sap.mount(root);
  return root;
}

// Dispatch the one write path on a control (what a keystroke does).
export function type(control, value) {
  if (control.type === "checkbox" || control.type === "radio") control.checked = !!value;
  else control.value = String(value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

export { Sap };
