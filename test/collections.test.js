import { mount, type, Sap } from "./helpers/mount.js";

const TODO = `
  <main sap>
    <form trigger-add="todos"><input bind="draft"></form>
    <ul items="todos">
      <li item template>
        <input type="checkbox" bind="done">
        <span bind="title"></span>
        <button trigger-remove>x</button>
      </li>
      <li item>
        <input type="checkbox" bind="done" checked>
        <span bind="title">First</span>
        <button trigger-remove>x</button>
      </li>
      <li item>
        <input type="checkbox" bind="done">
        <span bind="title">Second</span>
        <button trigger-remove>x</button>
      </li>
    </ul>
    <output text="count(state.todos, t => !t.done) + ' open'"></output>
    <button id="addbtn" trigger-add="todos">add</button>
  </main>`;

describe("collections", () => {
  test("list intake + aggregate over rows", () => {
    const root = mount(TODO);
    expect(root.querySelector("output").textContent).toBe("1 open");
  });

  test("trigger-add clones the template, never the live rows", async () => {
    const root = mount(TODO);
    root.querySelector("#addbtn").click();
    await flush();
    const rows = root.querySelectorAll("[item]:not([template])");
    expect(rows.length).toBe(3);
    expect(rows[2].hasAttribute("template")).toBe(false);
    expect(rows[2].querySelector("span").textContent).toBe("");
  });

  test("a form trigger-add fires on submit (Enter)", async () => {
    const root = mount(TODO);
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(3);
  });

  test("a form trigger-add composes the new row from its matching fields and clears", async () => {
    const root = mount(`
      <main sap>
        <form trigger-add="todos"><input bind="title"></form>
        <ul items="todos"><li item template><input type="checkbox" bind="done"><span bind="title"></span></li></ul>
      </main>`);
    const input = root.querySelector("form [bind=title]");
    type(input, "Buy milk");
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    const rows = root.querySelectorAll("[item]:not([template])");
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector("span").textContent).toBe("Buy milk");
    expect(input.value).toBe(""); // the form cleared itself

    // a second add appends another row and does not touch the first
    type(input, "Walk dog");
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    const after = root.querySelectorAll("[item]:not([template])");
    expect(after.length).toBe(2);
    expect([...after].map((r) => r.querySelector("span").textContent)).toEqual(["Buy milk", "Walk dog"]);
  });

  test("a form trigger-add ignores fields the row does not declare", async () => {
    const root = mount(`
      <main sap>
        <form trigger-add="todos"><input bind="draft"></form>
        <ul items="todos"><li item template><span bind="title"></span></li></ul>
      </main>`);
    type(root.querySelector("form [bind=draft]"), "anything");
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    const rows = root.querySelectorAll("[item]:not([template])");
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector("span").textContent).toBe(""); // no "draft" field on the row
  });

  test("trigger-remove removes the clicked row", async () => {
    const root = mount(TODO);
    root.querySelectorAll("[item]:not([template]) button")[0].click();
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(1);
  });

  test("detail lens projects the selected row and edits write through", async () => {
    const root = mount(`
      <main sap state="selected">
        <ul items="contacts">
          <li item template set:selected="item.$key"><span bind="name"></span></li>
          <li item id="p1" set:selected="item.$key"><span bind="name">Alice</span></li>
          <li item id="p2" set:selected="item.$key"><span bind="name">Bob</span></li>
        </ul>
        <form detail="contacts by state.selected">
          <input bind="name" id="dn">
          <button type="button" id="del" onclick="Sap(this).$remove()">delete</button>
        </form>
      </main>`);
    root.querySelector("#p2").click();
    await flush();
    expect(root.querySelector("#dn").value).toBe("Bob");
    root.querySelector("#dn").value = "Bobby";
    root.querySelector("#dn").dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(root.querySelector("#p2 span").textContent).toBe("Bobby");
    // $remove() inside the detail removes the source row
    root.querySelector("#del").click();
    await flush();
    expect(root.querySelector("#p2")).toBeNull();
  });

  test("sort: stable-sorts by a field and toggles direction", async () => {
    const root = mount(`
      <main sap>
        <button sort:n id="s">sort</button>
        <ul items="nums">
          <li item template><span bind="n"></span></li>
          <li item><span bind="n">3</span></li>
          <li item><span bind="n">1</span></li>
          <li item><span bind="n">2</span></li>
        </ul>
      </main>`);
    const vals = () => [...root.querySelectorAll("[item]:not([template]) span")].map((s) => s.textContent);
    root.querySelector("#s").click();
    await flush();
    expect(vals()).toEqual(["1", "2", "3"]);
    root.querySelector("#s").click();
    await flush();
    expect(vals()).toEqual(["3", "2", "1"]);
  });

  test("move:up / move:down reorder a row", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template><span bind="v"></span><button move:up>u</button></li>
          <li item><span bind="v">a</span><button move:up>u</button></li>
          <li item><span bind="v">b</span><button move:up>u</button></li>
        </ul>
      </main>`);
    root.querySelectorAll("[item]:not([template]) button")[1].click();
    await flush();
    expect([...root.querySelectorAll("[item]:not([template]) span")].map((s) => s.textContent)).toEqual(["b", "a"]);
  });

  test("move:to moves a row to another list", async () => {
    const root = mount(`
      <main sap>
        <ul items="todo">
          <li item template><span bind="t"></span><button move:to="done">→</button></li>
          <li item id="card"><span bind="t">task</span><button move:to="done">→</button></li>
        </ul>
        <ul items="done"><li item template><span bind="t"></span></li></ul>
      </main>`);
    root.querySelector("#card button").click();
    await flush();
    const doneList = root.querySelectorAll("[items=done] [item]:not([template])");
    expect(doneList.length).toBe(1);
    expect(root.querySelectorAll("[items=todo] [item]:not([template])").length).toBe(0);
  });

  test("nested kanban: clone a column and add a card at depth 2", async () => {
    const root = mount(`
      <main sap items="columns">
        <section item template scope="board">
          <h2 bind="title"></h2>
          <ul items="cards"><li item template bind="name"></li></ul>
          <button class="ac" onclick="Sap(this).$add('cards')">+ card</button>
        </section>
        <section item id="c1" scope="board">
          <h2 bind="title">To Do</h2>
          <ul items="cards"><li item template bind="name"></li><li item bind="name">milk</li></ul>
          <button class="ac" onclick="Sap(this).$add('cards')">+ card</button>
        </section>
        <button id="addcol" onclick="const c = Sap(this).$add('columns'); c.title = 'Doing'"></button>
      </main>`);
    root.querySelector("#addcol").click();
    await flush();
    const cols = root.querySelectorAll('[scope="board"]:not([template])');
    expect(cols.length).toBe(2);
    expect(cols[1].querySelector("h2").textContent).toBe("Doing");
    cols[1].querySelector(".ac").click();
    await flush();
    expect(cols[1].querySelectorAll("[item]:not([template])").length).toBe(1);
  });

  test("filter doctrine: calc:match + show hides rows, aggregate still sees them", async () => {
    const root = mount(`
      <main sap>
        <input bind="q" value="">
        <ul items="people">
          <li item template calc:match="state.q === '' || item.name.toLowerCase().includes(state.q)" show="item.match"><span bind="name"></span><b bind="age"></b></li>
          <li item calc:match="state.q === '' || item.name.toLowerCase().includes(state.q)" show="item.match"><span bind="name">Alice</span><b bind="age">30</b></li>
          <li item calc:match="state.q === '' || item.name.toLowerCase().includes(state.q)" show="item.match"><span bind="name">Bob</span><b bind="age">40</b></li>
        </ul>
        <output text="sum(state.people, 'age')"></output>
      </main>`);
    expect(root.querySelector("output").textContent).toBe("70");
    type(root.querySelector("[bind=q]"), "ali");
    await flush();
    const rows = [...root.querySelectorAll("[item]:not([template])")];
    expect(rows[0].hidden).toBe(false);
    expect(rows[1].hidden).toBe(true);
    expect(root.querySelector("output").textContent).toBe("70"); // hidden rows still summed
  });

  test("Sap.batch bulk-removes picked rows", async () => {
    const root = mount(`
      <main sap>
        <ul items="inbox">
          <li item template><input type="checkbox" bind="picked"></li>
          <li item><input type="checkbox" bind="picked" checked></li>
          <li item><input type="checkbox" bind="picked"></li>
          <li item><input type="checkbox" bind="picked" checked></li>
        </ul>
        <button id="del" onclick="Sap.batch('Delete', () => Sap(this).inbox.filter(m => m.picked).forEach(m => m.$remove()))"></button>
      </main>`);
    root.querySelector("#del").click();
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(1);
  });

  test("confirm gates an action; a declined confirm does nothing", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template><button trigger-remove confirm="Sure?">x</button></li>
          <li item><button trigger-remove confirm="Sure?">x</button></li>
        </ul>
      </main>`);
    const orig = window.confirm;
    window.confirm = () => false;
    root.querySelector("[item]:not([template]) button").click();
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(1);
    window.confirm = () => true;
    root.querySelector("[item]:not([template]) button").click();
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(0);
    window.confirm = orig;
  });

  test("confirm uses the platform's themed consent dialog when present", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template><button trigger-remove confirm="Sure?">x</button></li>
          <li item><button trigger-remove confirm="Sure?">x</button></li>
        </ul>
      </main>`);
    const origConfirm = window.confirm;
    window.confirm = () => { throw new Error("native confirm must not fire when consent is present"); };
    let seenMsg = null;
    window.hyperclay = { consent: (msg, cb) => { seenMsg = msg; cb(); return { catch() {} }; } };
    root.querySelector("[item]:not([template]) button").click();
    await flush();
    expect(seenMsg).toBe("Sure?");
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(0);
    delete window.hyperclay;
    window.confirm = origConfirm;
  });

  test("a declined themed consent leaves the action unrun", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template><button trigger-remove confirm="Sure?">x</button></li>
          <li item><button trigger-remove confirm="Sure?">x</button></li>
        </ul>
      </main>`);
    // consent that never fires the callback = the user clicked Cancel.
    window.hyperclay = { consent: () => ({ catch() {} }) };
    root.querySelector("[item]:not([template]) button").click();
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(1);
    delete window.hyperclay;
  });

  test("a pending themed consent guards against a double-click re-firing", async () => {
    const root = mount(`
      <main sap>
        <ul items="xs">
          <li item template><button trigger-remove confirm="Sure?">x</button></li>
          <li item><button trigger-remove confirm="Sure?">x</button></li>
          <li item><button trigger-remove confirm="Sure?">x</button></li>
        </ul>
      </main>`);
    let calls = 0;
    let captured = null;
    window.hyperclay = { consent: (msg, cb) => { calls++; captured = cb; return { catch() { return this; } }; } };
    const btn = root.querySelector("[item]:not([template]) button");
    btn.click();
    btn.click();
    await flush();
    expect(calls).toBe(1);
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(2);
    captured();
    await flush();
    expect(root.querySelectorAll("[item]:not([template])").length).toBe(1);
    delete window.hyperclay;
  });
});

// A hyperclay `sortable` drag reorder announces itself with a dedicated
// `clay:sorted` event. Sap's document listener re-derives the app(s) the drag
// touched, independent of the mutation bridge (so it works even inside a pause window).
describe("clay:sorted reorder event", () => {
  test("schedules a re-derive of the touched list with no MutationObserver at all", async () => {
    const RealMO = global.MutationObserver;
    delete global.MutationObserver; // onSorted is the only re-derive path left
    try {
      const root = mount(`
        <main sap>
          <span effect="window.__c = (window.__c||0)+1"></span>
          <ul items="xs">
            <li item template><span bind="v"></span></li>
            <li item><span bind="v">a</span></li>
            <li item><span bind="v">b</span></li>
          </ul>
        </main>`);
      const list = root.querySelector("[items=xs]");
      const base = window.__c; // effect ran during the mount pass
      list.dispatchEvent(new CustomEvent("clay:sorted", {
        bubbles: true,
        detail: { item: list.querySelectorAll("[item]")[1], from: list, to: list, oldIndex: 1, newIndex: 0 },
      }));
      await flush();
      expect(window.__c).toBeGreaterThan(base);
      delete window.__c;
    } finally {
      global.MutationObserver = RealMO;
    }
  });

  test("a cross-list drag re-derives both apps it spans", async () => {
    const RealMO = global.MutationObserver;
    delete global.MutationObserver;
    try {
      document.body.innerHTML = `
        <main sap id="A"><span effect="window.__a = (window.__a||0)+1"></span>
          <ul items="xs"><li item template><span bind="v"></span></li><li item><span bind="v">a</span></li></ul>
        </main>
        <main sap id="B"><span effect="window.__b = (window.__b||0)+1"></span>
          <ul items="ys"><li item template><span bind="v"></span></li></ul>
        </main>`;
      Sap._reset();
      Sap.mount(document.querySelector("#A"));
      Sap.mount(document.querySelector("#B"));
      const listA = document.querySelector("#A [items=xs]");
      const listB = document.querySelector("#B [items=ys]");
      const baseA = window.__a, baseB = window.__b;
      listA.dispatchEvent(new CustomEvent("clay:sorted", {
        bubbles: true,
        detail: { from: listA, to: listB, oldIndex: 0, newIndex: 0 },
      }));
      await flush();
      expect(window.__a).toBeGreaterThan(baseA);
      expect(window.__b).toBeGreaterThan(baseB);
      delete window.__a; delete window.__b;
    } finally {
      global.MutationObserver = RealMO;
    }
  });
});
