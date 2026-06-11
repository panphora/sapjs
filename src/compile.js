import { helperBundle } from "./helpers.js";

// The frozen compile signature. These argument names are fixed forever.
// App-registered formats extend the `fmt` namespace object, never this list,
// so the source-keyed cache never invalidates.
const ARGS = ["state", "item", "el", "root", "fmt", "num", "sum", "count", "avg", "min", "max", "plural", "days"];

const cache = new Map();

const STATE_REF = /\bstate\.([a-z][a-z0-9_]*)/g;
const ITEM_REF = /\bitem\.([a-z][a-z0-9_]*)/g;

function extractDeps(src) {
  const state = new Set();
  const item = new Set();
  let m;
  STATE_REF.lastIndex = 0;
  while ((m = STATE_REF.exec(src))) state.add(m[1]);
  ITEM_REF.lastIndex = 0;
  while ((m = ITEM_REF.exec(src))) item.add(m[1]);
  return { state, item };
}

// Compile an expression to a function with the frozen signature.
// `statement` mode (for effect=) runs a statement body with no return.
export function compile(src, statement = false) {
  const key = (statement ? "!" : "") + src;
  let entry = cache.get(key);
  if (entry) return entry;
  if (cache.size > 512) cache.clear();

  try {
    const body = statement ? `"use strict";\n${src}` : `"use strict"; return (${src});`;
    const fn = new Function(...ARGS, body);
    entry = { fn, src, statement, deps: extractDeps(src), error: null };
  } catch (err) {
    entry = { fn: null, src, statement, deps: { state: new Set(), item: new Set() }, error: err };
  }
  cache.set(key, entry);
  return entry;
}

// Evaluate a compiled entry against an { state, item, el, root } context.
// Throws if the expression throws (callers do preserve-on-error).
export function run(entry, ctx) {
  if (entry.error) throw entry.error;
  return entry.fn(ctx.state, ctx.item, ctx.el ?? null, ctx.root, ...helperBundle());
}

export function clearCompileCache() {
  cache.clear();
}

// Topologically sort calc bindings within a single scope object so a calc that
// reads another calc evaluates after it. Cycles throw, naming the chain.
export function topoSort(calcs) {
  // calcs: array of { name, entry, ... } that share one owner object.
  const byName = new Map();
  for (const c of calcs) byName.set(c.name, c);
  const out = [];
  const state = new Map(); // name -> 0 visiting, 1 done
  const stack = [];

  function visit(c) {
    const s = state.get(c.name);
    if (s === 1) return;
    if (s === 0) {
      const cycle = [...stack.slice(stack.indexOf(c.name)), c.name].join(" -> ");
      const err = new Error(`calc: cycle: ${cycle}`);
      err.sapCode = "E07";
      err.cycle = cycle;
      throw err;
    }
    state.set(c.name, 0);
    stack.push(c.name);
    for (const dep of c.entry.deps.state) {
      const d = byName.get(dep);
      if (d && d !== c) visit(d);
    }
    for (const dep of c.entry.deps.item) {
      const d = byName.get(dep);
      if (d && d !== c) visit(d);
    }
    stack.pop();
    state.set(c.name, 1);
    out.push(c);
  }

  for (const c of calcs) visit(c);
  return out;
}
