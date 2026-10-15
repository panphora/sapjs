// The directive-plan cache changes speed, never results: the same edit sequence
// replayed on a fresh mount with every plan dropped before each pass must leave
// the DOM byte-identical after every step. The sequence is random but seeded, so
// a failure names the seed that reproduces it.
import { mount, type, Sap } from "./helpers/mount.js";
import { dropPlans } from "../src/plan.js";

const ROWS = 120;
const STEPS = 160;

function todoMarkup(n) {
  let rows = "";
  for (let i = 0; i < n; i++) {
    const done = i % 3 === 0;
    rows += `<li item data-id="t${i}" class:done="item.done"${done ? ' class="done"' : ""}><input type="checkbox" bind="done"${done ? " checked" : ""}><span bind="title">Task ${i}</span><b text="item.title.length"></b></li>`;
  }
  return `<main sap state="q:transient"><ul items="todos"><li item template data-id="" class:done="item.done"><input type="checkbox" bind="done"><span bind="title"></span><b text="item.title.length"></b></li>${rows}</ul>` +
    `<output text="count(state.todos, t => !t.done) + ' left'"></output>` +
    `<nav each="fmt.open(state.todos, state.q)"><template><a class:on="item.done" text="item.title"></a></template></nav>` +
    `<input id="q" bind="q" transient></main>`;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// One random edit, expressed as a function of the root so both runs apply the
// same edit to their own DOM. Every kind a page can see: a keystroke, a devtools
// attribute edit, a row added, removed or moved, an inert toggle, a directive change.
function randomEdit(rand) {
  const kind = Math.floor(rand() * 9);
  const pick = Math.floor(rand() * ROWS);
  const n = Math.floor(rand() * 1000);
  switch (kind) {
    case 0: return (root) => { const box = root.querySelector(`[data-id="t${pick}"] input`); if (box) type(box, !box.checked); };
    case 1: return (root) => { const span = root.querySelector(`[data-id="t${pick}"] span`); if (span) span.textContent = `Task ${pick} v${n}`; };
    case 2: return (root) => { const ul = root.querySelector("[items]"); const li = ul.lastElementChild.cloneNode(true); li.setAttribute("data-id", `n${n}`); li.querySelector("span").textContent = `New ${n}`; ul.appendChild(li); };
    case 3: return (root) => { const row = root.querySelector(`[data-id="t${pick}"]`); if (row) row.remove(); };
    case 4: return (root) => { const rows = root.querySelectorAll("[items] > [item]:not([template])"); if (rows.length > 2) rows[0].parentElement.insertBefore(rows[rows.length - 1], rows[1]); };
    case 5: return (root) => { const row = root.querySelector(`[data-id="t${pick}"]`); if (row) row.setAttribute("class:done", n % 2 ? "!item.done" : "item.done"); };
    case 6: return (root) => { const row = root.querySelector(`[data-id="t${pick}"]`); if (row) { if (row.hasAttribute("sap-ignore")) row.removeAttribute("sap-ignore"); else row.setAttribute("sap-ignore", ""); } };
    case 7: return (root) => { type(root.querySelector("#q"), n % 3 ? String(n % 7) : ""); };
    default: return (root) => { const b = root.querySelector(`[data-id="t${pick}"] b`); if (b) b.setAttribute("text", n % 2 ? "item.title.length * 2" : "item.title.length"); };
  }
}

async function replay(edits, cold) {
  Sap.config({ formats: { open: (todos, q) => todos.filter((t) => !t.done && (!q || t.title.includes(q))).map((t) => ({ $key: t.$key, title: t.title, done: t.done })) } });
  const root = mount(todoMarkup(ROWS));
  await flush();
  const states = [root.outerHTML];
  for (const edit of edits) {
    edit(root);
    if (cold) dropPlans();
    await flush();
    states.push(root.outerHTML);
  }
  const app = Sap.status().apps[0];
  states.push(JSON.stringify({ ok: app.ok, errors: app.errors, warnings: app.warnings }));
  return states;
}

test("a seeded random edit sequence paints the same DOM with and without the plan cache", async () => {
  const seed = Number(process.env.SAP_SEED) || 20261014;
  const rand = rng(seed);
  const edits = [];
  for (let i = 0; i < STEPS; i++) edits.push(randomEdit(rand));
  const warm = await replay(edits, false);
  const cold = await replay(edits, true);
  for (let i = 0; i < warm.length; i++) {
    if (warm[i] !== cold[i]) throw new Error(`seed ${seed}: DOM differs after step ${i}\nwarm: ${warm[i].slice(0, 400)}\ncold: ${cold[i].slice(0, 400)}`);
  }
  expect(warm.length).toBe(STEPS + 2);
});
