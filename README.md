# sap

**Reactive HTML in attributes. No build step, no virtual DOM, no state object.**

Sap is a tiny reactive layer for hand-written HTML files. You declare state, formulas, and paints as plain attributes; Sap rebuilds everything from the live DOM on every change. The DOM is the only store, so the file you save *is* the app: open it in any browser, it runs.

```html
<script src="https://unpkg.com/sapjs"></script>

<main app>
  <input type="number" bind="qty" value="3">
  <input type="number" bind="price" value="10">
  <output calc:total="state.qty * state.price" text:usd="state.total"></output>
</main>
```

Type in either box and the total repaints. That is the whole program. There is no JavaScript to write.

---

## Why

- **The DOM is the state.** No store to sync, no hydration mismatch. Edit a field by hand in devtools, paste from the console, receive a live-sync morph: the next pass reads it and repaints. Same code path as a keystroke.
- **The saved file is correct before JS runs.** Every paint targets a real attribute (`hidden`, `value`, `textContent`, `disabled`), so view-source is legible and pre-JS renders right.
- **One write path.** Every change is a property write plus a synthetic `input`/`change` event. Persistence, undo, and recompute all hang off the same event, so they never diverge.
- **Failures are loud and attributed.** A typo'd field name, a foreign-dialect attribute, a calc cycle: each prints a stable error code, the element's CSS path, the authored source, and a copy-pasteable fix. Agents can author Sap files and read back exactly what is wrong.
- **It runs anywhere.** Standalone in any `.html` file, or wired into [Hyperclay](https://hyperclay.com) for autosave, versioning, and real-time collaboration with zero extra code.

---

## The mental model

Three ideas, mapped to attributes:

| | What | Attributes |
|---|---|---|
| **structure** | declared state | `state=`, `bind`, `items`, `scope` |
| **compute** | derived values | `calc:` |
| **paint** | output + side effects | `text`, `show`, `attr:`, `class:`, `css:`, `effect=` |

Reads are expressions over `state` (the nearest scope) and `item` (the nearest row). Writes go through `Sap(el)` in your `onclick` handlers, or the action attributes (`set:`, `trigger-*`, `move:`, `sort:`).

---

## Install

Drop-in (auto-mounts every `[app]` on load):

```html
<script src="https://unpkg.com/sapjs"></script>
```

Or as a module:

```js
import Sap from "sapjs";
```

```bash
npm install sapjs
```

---

## Quickstart

A complete todo app. Copy it into a `.html` file and open it.

```html
<script src="https://unpkg.com/sapjs"></script>

<main app>
  <form trigger-add="todos">
    <input bind="draft" placeholder="What needs doing?" autofocus>
  </form>

  <ul items="todos">
    <li item template>
      <input type="checkbox" bind="done">
      <span bind="title" contenteditable="plaintext-only"></span>
      <button trigger-remove>✕</button>
    </li>
  </ul>

  <output text="plural(count(state.todos, t => !t.done), 'task', 'tasks') + ' left'"></output>
</main>

<script>
  // wire the form's draft into a new row's title
  document.querySelector("form").addEventListener("submit", () => {
    const s = Sap(document.querySelector("[app]"));
    const draft = s.draft.trim();
    if (draft) s.todos[s.todos.length - 1].title = draft;
    s.draft = "";
  });
</script>
```

`trigger-add` on a `<form>` fires on Enter. `count(...)` sees every row live. Nothing is stored anywhere but the DOM.

---

## Vocabulary

### Declaring state

```html
<main app state="filter=all step:num=1 done:bool">
```

`state=` declares attribute-carried fields on a scope. Bare = string, `:num` = number, `:bool` = boolean, `name=value` = default. `bind` declares a field carried by a control. `items` declares a field that is an array of rows. `scope="name"` nests a child state object readable as `state.name`.

### `bind` — two-way, by control type

The control is the contract. No modifiers, ever.

| Control | Value |
|---|---|
| `input[type=text/email/url]`, `textarea` | string |
| `input[type=number/range]` | number |
| `input[type=checkbox]` | boolean |
| `input[type=radio]` (group by `name`) | the checked value |
| `input[type=date/time]` | ISO string |
| `select` | selected value |
| `select[multiple]` | array of values |
| `[contenteditable]`, text leaf | textContent |

`type=file` and `type=password` without `transient` are mount errors (files and passwords never serialize).

### `calc:` — computed fields

```html
<dd calc:subtotal="sum(state.lines, 'linetotal')" text:usd2="state.subtotal"></dd>
<dd calc:total="state.subtotal + state.tax" text:usd2="state.total"></dd>
```

Place the formula beside the cell that shows it. Order is by dependency, not document position; `total` waits for `subtotal` automatically. Cycles are a hard error naming the chain.

### Paints

| Attribute | Paints |
|---|---|
| `text` / `text:FMT` | `textContent`, optionally formatted |
| `show="expr"` | toggles native `hidden` |
| `attr:NAME="expr"` | an attribute (native booleans like `disabled` toggle by presence) |
| `class:NAME="expr"` | a class on/off |
| `css:NAME="expr"` | a `--NAME` custom property |
| `effect="stmt"` | a statement run after paint (charts, `document.title`, third-party sync) |
| `invalid="expr"` | `setCustomValidity(msg)` for native form gating |

A throwing paint writes nothing: the DOM keeps its last-good value, the element gets a `sap-error` beacon, and the console logs one attributed error.

### Actions (attributes)

| Attribute | Does |
|---|---|
| `set:field="expr"` | write a field on click |
| `trigger-add="list"` | clone the row template (on a `<form>`, fires on Enter) |
| `trigger-remove` | remove the nearest row |
| `trigger-reset` | reset the scope to its defaults |
| `move:up` / `move:down` | reorder a row |
| `move:to="list"` | move a row to another list |
| `sort:FIELD` | stable column sort, direction toggles statelessly |
| `confirm="msg"` | gate any action behind `window.confirm` |
| `detail="LIST by KEYEXPR"` | project the selected row into a panel |

### Actions (JavaScript)

`Sap(el)` returns a live, write-through proxy onto the scope or row that owns `el`. Reads come from the DOM; writes go through the one write path.

```html
<button onclick="const s = Sap(this); s.$add('todos').title = s.draft.trim(); s.draft = ''">Add</button>
<button onclick="Sap(this).inbox.filter(m => m.picked).forEach(m => m.$remove())">Delete selected</button>
```

Row proxies carry `$key`, `$index`, `$el`, and `$add(list)`, `$reset()`, `$remove()`, `$move(listOrPath)`.

---

## Expressions

The compile signature is frozen forever:

```js
(state, item, el, root, fmt, num, sum, count, avg, min, max, plural, days)
```

- `state` — the nearest scope object; `item` — the nearest row; `root` — the app scope; `el` — the host element.
- Helpers: `num(v)`, `sum(rows, key|fn)`, `count(rows, pred?)`, `avg`, `min`, `max`, `plural(n, one, many)`, `days(a, b)`.
- Row metadata: `item.$key`, `item.$index`, `item.$el`.

Expressions are **read-only**. Writing happens through `Sap(el)` or the action attributes.

### Formats

`text:usd`, `usd2`, `pct`, `pct1`, `int`, `num`, `num2`, `compact`, `date`, `clock`. Register your own:

```js
Sap.formats.eur = (n) => "€" + n.toFixed(2);
```

A numeric format applied to `NaN`/`Infinity` throws a loud `E22` instead of silently painting "NaN".

---

## Collections

```html
<ul items="contacts">
  <li item template set:selected="item.$key" class:active="state.selected === item.$key">
    <span bind="name"></span>
  </li>
</ul>

<form detail="contacts by state.selected" state="selected">
  <label>Name <input bind="name"></label>
  <label>Email <input type="email" bind="email"></label>
  <button onclick="Sap(this).$remove()">Delete</button>
</form>
```

Click a row to select it; the detail panel projects that row. Edits in the panel route back to the source row through the proxy. `Sap(this)` inside the panel resolves the selected row, so `$remove()` and `$move()` work. No match hides the panel.

**Filtering:** hide, never remove, so aggregates still see every row.

```html
<li item calc:match="state.q === '' || item.name.toLowerCase().includes(state.q)" show="item.match">
```

**Nested lists** (kanban): a row that declares `items="cards"` exposes them as `item.cards`. Cloning the row keeps its inner template. See the homepage for the worked board.

---

## The console contract

Every app prints one machine-readable line on mount:

```
sap ✓ main[app] · fields 12 · calcs 4 · paints 18 · actions 6 · lists 2 · rows 7 · warnings 0 · mount writes 0 · 1.8ms
```

`mount writes 0` on a previously-saved file is the zero-byte-mount guarantee: Sap touched nothing.

| Call | Returns |
|---|---|
| `Sap.status()` | JSON twin of the green line |
| `Sap.report()` | JSON list of every error `{code, el, expr, problem, fix}` |
| `Sap.why(el)` | how a field resolves: declaring element, carrier, value |
| `Sap.debug(true)` | per-pass paint diffs |
| `Sap.doctor()` | full-page audit (dead state, duplicate ids, drift, …) |
| `Sap.refresh()` | one synchronous pass (set state, refresh, read on the next line) |
| `Sap.batch(label, fn)` | group bulk mutations into one undo entry |

### Error codes (selection)

| Code | Meaning |
|---|---|
| `E01` | foreign-dialect attribute (`x-text`, `v-if`, `@click`) — teaches the Sap spelling |
| `E07` | `calc:` cycle, names the chain |
| `E12` | unknown state key, with a did-you-mean |
| `E22` | a numeric format hit `NaN`/`Infinity` |
| `E24` | an expression threw (preserve-on-error + beacon) |
| `E26` | recompute circuit breaker tripped |
| `E31` | `bind` on a password without `transient` |

Errors that contradict the file's structure halt the app at mount (no listeners arm, the file stays byte-frozen). Everything else degrades per element.

---

## Hyperclay integration

Sap runs standalone in any HTML file. When `window.hyperclay` is present it rides the platform for free:

- live-sync morphs trigger a synchronous re-derive (`hyperclay:livesync-applied`),
- undo/redo replays heal derived paints,
- `Sap.batch` labels grouped edits in the undo history,
- a morph that replaces the `[app]` element re-mounts itself.

No configuration. The same file works offline and online.

---

## What's in v1

The full vocabulary above. Deferred to v1.1: `check:` in-file assertions, `$invalid` (covered by native `:invalid` + CSS), nested collections beyond one level, and a first-class drag surface.

---

## License

MIT
