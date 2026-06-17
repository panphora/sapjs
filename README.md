# sap

**Reactive HTML in attributes. No build step, no virtual DOM, no state object.**

Sap is a tiny reactive layer for hand-written HTML files. You declare state, formulas, and paints as plain attributes; Sap rebuilds everything from the live DOM on every change. The DOM is the only store, so the file you save *is* the app: open it in any browser, it runs.

```html
<script src="https://cdn.jsdelivr.net/npm/sapjs/dist/sap.min.js"></script>

<main sap>
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

Drop-in (auto-mounts every `[sap]` on load):

```html
<script src="https://cdn.jsdelivr.net/npm/sapjs/dist/sap.min.js"></script>
```

Or as a module:

```js
import Sap from "sapjs";
```

```bash
npm install sapjs
```

Importing the module also auto-mounts every `[sap]` on `DOMContentLoaded`. Call `Sap.mount(rootOrSelector)` to mount a root added later, or `Sap.mount()` to rescan; `Sap.config({ formats })` registers custom formats as a config-object alternative to `Sap.formats.x`.

## Internal explainer

For the source-grounded walkthrough with live demos, open `docs/sapjs-explained.html` directly in a browser. It is a self-contained file with the real `dist/sap.js` engine inlined, so it works from `file://` with no network or build step.

Edit `docs/sapjs-explained.template.html`, then run:

```bash
npm run build:docs
```

That regenerates `docs/sapjs-explained.html` and refreshes the inlined engine from `dist/sap.js`.

---

## Quickstart

A complete todo app, with no JavaScript at all. Copy it into a `.html` file and open it.

```html
<script src="https://cdn.jsdelivr.net/npm/sapjs/dist/sap.min.js"></script>

<main sap>
  <form trigger-add="todos">
    <input bind="title" placeholder="What needs doing?" required autofocus>
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
```

The form's input is named `title`, the same as the row's field. On Enter, `trigger-add` clones the template, copies the form's matching fields into the new row, and clears the box. `required` lets the browser block empty submits natively. `count(...)` sees every row live. Nothing is stored anywhere but the DOM.

---

## How it works

**Every change triggers one pass.** A pass throws away all in-memory state and rebuilds it by reading the DOM top to bottom: every `state=`, `bind`, and `items=` is read into a fresh object, `calc:` fields compute, then paints write only what changed. The objects are then discarded. There is no retained JS state to drift from the DOM, which is why a hand-edit in devtools, a console paste, or a live-sync morph all just work: each is simply the next pass's input.

**Passes are batched.** A burst of writes coalesces into one pass on the next microtask, so reading painted output on the line right after a write sees the old DOM. Call `Sap.refresh()` for an immediate synchronous pass when you must read painted output now.

**One write path, three steps.** A write (1) sets the control's live value, (2) mirrors it into a serializable attribute so view-source and save reflect it, then (3) fires synthetic `input` + `change` events. Because a programmatic write looks exactly like typing, autosave, undo, and recompute all observe it the same way. Two consequences follow: paints write silently (no event, to avoid feedback loops), and undo/redo replay needs the Hyperclay bridge, since replaying an attribute fires no event.

**Scopes and rows.** `sap`, `scope=`, `items=`/`item`, and `detail=` are the boundaries that form the state tree. A field belongs to its nearest enclosing scope, and to the **row** object when it sits inside an `[item]`, so the same `bind="title"` lands in a different owner depending on nesting. `scope="cart"` reads as `state.cart.field`; `root` always points at the app scope.

---

## Vocabulary

### Declaring state

```html
<main sap state="filter=all step:num=1 done:bool">
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

Binding a `type=file` is always a mount error (`E32`); files never serialize into an HTML file. Binding a `type=password` halts unless you add `transient` (`E31`). `transient` (the bare attribute, or a `state="field:transient"` suffix) keeps a value in the live DOM only: Sap drives the app from it but strips it from the saved file, so passwords and search boxes never persist.

Note: `<select>` and `[contenteditable]`/text-leaf bindings are **not** mirrored to an attribute the way checkbox/radio/number/text are; they persist only because the live DOM is saved as-is, so a programmatic `<select>` change may not survive a save unless you set its `selected` attribute yourself.

### `calc:` — computed fields

```html
<dd calc:subtotal="sum(state.lines, 'linetotal')" text:usd2="state.subtotal"></dd>
<dd calc:total="state.subtotal + state.tax" text:usd2="state.total"></dd>
```

Place the formula beside the cell that shows it. Order is by dependency, not document position; `total` waits for `subtotal` automatically. A cycle logs `E07` naming the chain, then falls back to source-order evaluation: the values may be wrong, but the app keeps running.

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

`effect=` is for side effects only: touch `el`, set `document.title`, call a chart library. Assigning to `state.*` inside an effect does nothing, since it mutates a per-pass snapshot that is then discarded; and writing `value=` or `checked=` on a bound control inside an effect halts the app at mount (`E30`). Write state through `onclick` + `Sap(this)` instead.

`invalid=` is the one expression that fails quiet: if it throws, the field is treated as **valid** and nothing is logged, unlike `text`/`calc`/`effect`. Guard `invalid` expressions against undefined, or a bug there silently disables the gate.

### Actions (attributes)

| Attribute | Does |
|---|---|
| `set:field="expr"` | write a field on click |
| `trigger-add="list"` | add a row. On a `<form>` it fires on Enter, fills the new row from the form's matching-named fields, then clears them |
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
<button onclick="['Buy milk', 'Walk dog'].forEach(t => Sap(this).$add('todos').title = t)">Add starter tasks</button>
<button onclick="Sap(this).inbox.filter(m => m.picked).forEach(m => m.$remove())">Delete selected</button>
```

Reach for the verbs when an attribute can't express the work: bulk adds, filtered removes, transforms. For a single "add one row from a form", prefer `<form trigger-add>` (above). `$add(list)` returns the new row's proxy. Row proxies carry `$key`, `$index`, `$el`, and `$add(list)`, `$reset()`, `$remove()`, `$move(listOrPath)`.

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

`num(v)` coerces any non-number (`"12px"`, `"abc"`, blank) to `0`, never `NaN`, and `sum`/`avg`/`min`/`max` inherit that, so a typo'd field name silently sums to 0 rather than erroring. (A numeric *format* on a non-finite value still throws `E22`; see Formats below.)

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

Click a row to select it; the detail panel projects that row. Edits in the panel route back to the source row through the proxy. `Sap(this)` inside the panel resolves the selected row, so `$remove()` and `$move()` work. No match hides the panel. The panel also hides silently if the `by` key expression throws or the spec is malformed: no error, no beacon. If a panel never appears, check the `by` expression and that the key resolves to the selected row's `$key`.

**Filtering:** hide, never remove, so aggregates still see every row.

```html
<li item calc:match="state.q === '' || item.name.toLowerCase().includes(state.q)" show="item.match">
```

**Nested lists** (kanban). Nesting works past one level: a row that declares `items="cards"` exposes them as `item.cards`, and `Sap(this).$add('cards')` adds a card inside that row. Cloning the row keeps its inner template.

```html
<main sap items="columns">
  <section item template scope="board">
    <h2 bind="title"></h2>
    <ul items="cards">
      <li item template bind="name"></li>
    </ul>
    <button onclick="Sap(this).$add('cards')">+ card</button>
  </section>
</main>
```

The one nesting limit is an `items=` list placed inside a `detail=` panel, which is a mount error (`E17`).

---

## The console contract

Every app prints one machine-readable line on mount:

```
sap ✓ main[sap] · fields 12 · calcs 4 · paints 18 · actions 6 · lists 2 · rows 7 · warnings 0 · mount writes 0 · 1.8ms
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
- a morph that replaces the `[sap]` element re-mounts itself.

No configuration. The same file works offline and online.

---

## What's in v1

The full vocabulary above. Deferred to v1.1: `check:` in-file assertions, `$invalid` (covered by native `:invalid` + CSS), and a first-class drag surface.

---

## License

MIT
