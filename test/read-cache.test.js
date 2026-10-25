// The bounded read cache (src/read-cache.js). An intake pass may reuse a record's raw
// attribute strings and a bound leaf's text, but every way the page can change them
// must reach the next pass: attribute edits, character data (which the directive plan
// observer does not watch), nested text, a subtree edited while detached, a peer that
// replaces an element, and a mutation hub that reports nothing. Controls, presence
// declarations and typed parsing stay live and per pass, and a root outside the
// observed document reads straight through.

import { mount, Sap } from "./helpers/mount.js";
import { runPass } from "../src/pass.js";
import { countReads, settle } from "./helpers/intake-sequences.js";

const ROWS = 6;

function rowMarkup(i) {
  return (
    `<article class="entry" item data-id="r${i}" state="data-date data-tags data-pinned:presence"` +
    ` data-date="2025-01-0${i + 1}" data-tags="t${i}"${i % 2 ? " data-pinned" : ""}>` +
    `<pre><code class="entry-body" bind="body">Body ${i}</code></pre></article>`
  );
}

function markup(count = ROWS, rows = null) {
  let out = "";
  for (let i = 0; i < count; i++) out += rows ? rows(i) : rowMarkup(i);
  return (
    `<main sap state="q:transient">` +
    `<input id="q" type="search" bind="q" transient placeholder="Search">` +
    `<section id="entries" items="entries">${out}</section></main>`
  );
}

async function fixture(html = markup()) {
  const root = mount(html);
  await settle();
  return { root, app: Sap._registry.get(root) };
}

function entry(root, id) {
  return root.querySelector(`article[data-id="${id}"]`);
}

function bodyOf(root, id) {
  return entry(root, id).querySelector(".entry-body");
}

function recordReads(counts) {
  return {
    attrs: counts.attrByName["data-date"] || 0,
    text: counts.recordText,
    presence: counts.hasAttrByName["data-pinned"] || 0,
  };
}

let reads = null;

beforeEach(() => {
  reads = countReads();
});

afterEach(() => {
  reads.restore();
  reads = null;
  Sap._reset();
  delete window.hyperclay;
});

test("an unchanged pass reuses every cached record read but keeps presence live", async () => {
  const { app } = await fixture();
  reads.reset();
  runPass(app);
  expect(recordReads(reads.counts)).toEqual({ attrs: 0, text: 0, presence: ROWS });
});

test("a character-data edit reaches the next pass and is the only body read", async () => {
  const { root, app } = await fixture();
  bodyOf(root, "r2").firstChild.data = "Edited in place";
  reads.reset();
  runPass(app);
  expect(recordReads(reads.counts)).toEqual({ attrs: 1, text: 1, presence: ROWS });
  expect(app._state.entries[2].body).toBe("Edited in place");

  bodyOf(root, "r3").textContent = "Replaced text node";
  reads.reset();
  runPass(app);
  expect(recordReads(reads.counts)).toEqual({ attrs: 1, text: 1, presence: ROWS });
  expect(app._state.entries[3].body).toBe("Replaced text node");
});

test("a nested text edit reaches the next pass", async () => {
  const { root, app } = await fixture(
    markup(1, () =>
      `<article class="entry" item data-id="n0" state="data-date" data-date="2025-05-05">` +
      `<div class="entry-body" contenteditable bind="body">Intro <em>middle</em> end</div></article>`)
  );
  root.querySelector(".entry-body em").firstChild.data = "changed";
  reads.reset();
  runPass(app);
  expect(recordReads(reads.counts).text).toBe(1);
  expect(app._state.entries[0].body).toBe("Intro changed end");
});

test("an attribute edit, a cached null becoming an empty string and the reverse", async () => {
  const { root, app } = await fixture();
  entry(root, "r2").setAttribute("data-date", "2026-02-02");
  reads.reset();
  runPass(app);
  expect(recordReads(reads.counts)).toEqual({ attrs: 1, text: 0, presence: ROWS });
  expect(app._state.entries[2].date).toBe("2026-02-02");

  entry(root, "r2").removeAttribute("data-date");
  reads.reset();
  runPass(app);
  expect(recordReads(reads.counts)).toEqual({ attrs: 1, text: 0, presence: ROWS });
  expect(app._state.entries[2].date).toBe("");
});

test("a record whose state declaration changes is read through the new declaration", async () => {
  const { root, app } = await fixture();
  const row = entry(root, "r1");
  row.setAttribute("state", "data-date data-tags data-pinned:presence data-words");
  row.setAttribute("data-words", "42");
  reads.reset();
  runPass(app);
  expect(app._state.entries[1]).toMatchObject({ date: "2025-01-02", words: "42" });
  expect(recordReads(reads.counts)).toEqual({ attrs: 1, text: 0, presence: ROWS });
});

test("a subtree edited while detached is read fresh when it comes back", async () => {
  const { root, app } = await fixture();
  const piece = entry(root, "r4");
  const body = bodyOf(root, "r4");
  piece.remove();
  await settle();
  body.firstChild.data = "Edited while detached";
  piece.setAttribute("data-date", "2026-04-04");
  root.querySelector("#entries").append(piece);
  reads.reset();
  runPass(app);
  const moved = app._state.entries.find((e) => e.body === "Edited while detached");
  expect(moved.date).toBe("2026-04-04");
  expect(root.querySelector("#entries").lastElementChild).toBe(piece);
});

test("a peer that replaces an element with the same ID is read fresh", async () => {
  const { root, app } = await fixture();
  const old = entry(root, "r1");
  const next = document.createElement("article");
  next.className = "entry";
  next.setAttribute("item", "");
  next.setAttribute("data-id", "r1");
  next.setAttribute("state", "data-date data-tags data-pinned:presence");
  next.setAttribute("data-date", "2026-03-03");
  next.setAttribute("data-tags", "replaced");
  next.innerHTML = `<pre><code class="entry-body" bind="body">Replaced body</code></pre>`;
  old.replaceWith(next);
  reads.reset();
  runPass(app);
  expect(app._state.entries[1]).toMatchObject({ date: "2026-03-03", tags: "replaced", body: "Replaced body" });
});

test("a cached text leaf replaced by a real control is read live", async () => {
  const { root, app } = await fixture();
  const input = document.createElement("input");
  input.className = "entry-body";
  input.setAttribute("bind", "body");
  input.value = "Typed value";
  bodyOf(root, "r0").replaceWith(input);
  reads.reset();
  runPass(app);
  expect(app._state.entries[0].body).toBe("Typed value");
});

test("a control changed without an event is still read live by another control's pass", async () => {
  const { root, app } = await fixture(
    `<main sap><section id="entries" items="entries"><article class="entry" item data-id="c0">` +
    `<input class="done" type="checkbox" bind="done">` +
    `<input class="note" bind="note" value="start">` +
    `<input class="loud" type="number" bind="loud" value="0"></article></section></main>`
  );
  root.querySelector(".done").checked = true;
  const note = root.querySelector(".note");
  note.value = "typed";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(app._state.entries[0]).toMatchObject({ done: true, note: "typed" });
});

test("a format's parsed JSON array is fresh on every pass and every row", async () => {
  Sap.formats.mutate = (raw) => {
    const list = JSON.parse(raw);
    list.push("x");
    return list.length;
  };
  try {
    const { root, app } = await fixture(
      markup(2, (i) =>
        `<article class="entry" item data-id="j${i}" state="data-tags" data-tags='["a","b"]'>` +
        `<i class="count" text="fmt.mutate(item.tags)"></i></article>`)
    );
    const counts = () => [...root.querySelectorAll(".count")].map((el) => el.textContent);
    expect(counts()).toEqual(["3", "3"]);
    runPass(app);
    expect(counts()).toEqual(["3", "3"]);
    expect(app._state.entries.map((e) => e.tags)).toEqual(['["a","b"]', '["a","b"]']);
  } finally {
    delete Sap.formats.mutate;
  }
});

test("a hub that reports nothing still invalidates the cached reads", async () => {
  window.hyperclay = { Mutation: { onAnyChange: () => () => {}, pause() {}, resume() {} } };
  const { root, app } = await fixture();
  entry(root, "r5").setAttribute("data-date", "2028-08-08");
  bodyOf(root, "r5").firstChild.data = "Edited silently";
  const q = root.querySelector("#q");
  q.value = "anything";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(app._state.entries[5].body).toBe("Edited silently");
  expect(app._state.entries[5].date).toBe("2028-08-08");
});

test("an app outside the observed document reads straight through", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const root = document.createElement("main");
  root.setAttribute("sap", "");
  root.innerHTML =
    `<section items="entries"><article item data-id="s0" state="data-date" data-date="2025-01-01">` +
    `<code class="entry-body" bind="body">Shadow body</code></article></section>`;
  shadow.append(root);
  Sap.mount(root);
  const app = Sap._registry.get(root);
  await settle();
  root.querySelector("article").setAttribute("data-date", "2027-07-07");
  root.querySelector(".entry-body").firstChild.data = "Shadow edit";
  runPass(app);
  expect(app._state.entries[0]).toMatchObject({ date: "2027-07-07", body: "Shadow edit" });
  host.remove();
});
