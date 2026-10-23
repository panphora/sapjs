// The foreign-dialect dictionary: one teaching line per Alpine/Vue spelling. Only
// the full-only E01 lint check reads it, so the core never loads this file.

export function teachForAttr(name) {
  const n = name.toLowerCase();
  if (/^x-text$|^x-html$/.test(n)) return `use text="state.x" (Sap paints text only)`;
  if (/^x-show$|^v-show$|^v-if$/.test(n)) return `use show="expr" (toggles native hidden)`;
  if (/^x-model$|^v-model$/.test(n)) return `use bind="field"`;
  if (/^@|^x-on:|^v-on:|^on:/.test(n)) return `use native onclick + Sap(this) (no event directive)`;
  if (/^:|^x-bind:class$|^v-bind:class$/.test(n)) return `use class:NAME="expr" or attr:NAME="expr"`;
  if (/^x-for$|^v-for$/.test(n)) return `use items="name" on the container and item template on the row`;
  if (/^x-data$/.test(n)) return `declare state with state= / bind / items (no JS state object)`;
  if (/^x-init$/.test(n)) return `use a <script> or onclick + Sap(this)`;
  if (/^bind:/.test(n)) return `use bind="field"; one-way paint is attr:NAME="expr"`;
  if (/^x-/.test(n) || /^v-/.test(n)) return `this is a foreign-dialect attribute; Sap has no x-/v- attributes`;
  return null;
}
