# Building malleable document apps with sapjs

Ask for an expense tracker in one HTML file and the usual result is an `expenses` array, a `render()` function that rebuilds the table from it, and a save step that writes the array into a `<script>` tag. That works until something edits the page directly. An undo, a hand edit or a live sync merge changes the table, and the array still holds the old numbers. Live sync is the ClayJS `sync` plugin. It merges each saved edit into the other open copies of the file: other tabs, and on Hyperclay Local and hyperclay.com, other devices.

In a sapjs app, there is no array of records that you maintain. Every change runs a pass: one run that reads the page, computes and paints. Every pass rebuilds the records from the page. Here are two pieces of the expense tracker from section 9.1, exactly as they sit in the saved file:

```html
<tr item data-id="e-groc" state="data-category" data-category="food">
  <td><input bind="what" persist value="Groceries"></td>
  <td><input type="number" step="0.01" bind="amount" persist value="42.5"></td>
  …
</tr>
…
<output id="total" calc:total="sum(state.expenses, 'amount')" text:usd2="state.total">$54.50</output>
```

The `<tr>` is the expense. Its fields are its attributes and the bound controls inside it. The `$54.50` is the total, which sapjs computed from the rows and painted into the page. Change the groceries amount to 54.5 and the output reads `$66.50`. Save, and the file holds `value="54.5"` and `$66.50`.

This guide shows how to build an app that way: where each piece of data goes, which sapjs feature fits each part of the app, and the traps. It is for an LLM agent or a developer building one app in one file, such as a tracker, a Kanban board, a notes list or a CRM. Read it top to bottom before writing code.

What you need:

- A browser. A sapjs app runs from a file opened directly, with no server and no build step.
- To save edits back into the file: ClayJS and a host that writes saves, such as HTML Clay, Hyperclay Local or hyperclay.com. A file opened from disk shows the app but cannot save it. Edits made there are lost when the tab closes. Section 12 of the [ClayJS guide](https://clayjs.com/guide.md) compares the hosts.
- A page without a strict Content Security Policy. sapjs compiles expressions with `new Function`, so a policy without `unsafe-eval` breaks every expression on the page.

What this guide does not cover:

- Every attribute, helper, format and error code. Those are in [llms.txt](https://saphtml.com/llms.txt).
- How ClayJS saves, syncs and switches between edit mode and view mode. That is the [ClayJS guide](https://clayjs.com/guide.md).
- Apps that are mostly canvas drawing, network calls or third-party library code. Write those in plain JavaScript.

The sapjs test suite mounts every worked app in section 9. It checks that each one loads with no errors, no warnings and zero writes, and it exercises the adds, edits and removals described under each app.

## 1. The one rule

The saved DOM is the data. Each record is an element in the file, and its fields are attributes and text on that element. Saving the page saves the app.

Three rules follow from it, and every later section applies them:

- Store each record once. Use one element per record, in one place. A second copy, such as a JSON mirror or a rendered duplicate, drifts the first time a merge or a hand edit touches one of them.
- Derive everything else. Counts, totals, filtered lists and the open card's editor are computed from the records on every pass. Never store them as data.
- Keep per-tab state out of the file. The search text, the open card and the selected tab are not data.

sapjs fits this because every pass rebuilds its state from the page. Every change runs one pass:

1. sapjs walks the app and reads every declared field, bound control and list from the live page into objects. An unchanged plain list row keeps its object, with the fields from its last read written back (see below).
2. It runs the `calc:` expressions in dependency order.
3. It paints the results back into the page. A paint is an attribute such as `text=`, `show=` or `class:` that sapjs evaluates on every pass, writing only when the value changed.
4. It keeps those objects until the next pass replaces them, or, for an unchanged plain row, writes that row's fields onto its kept object again.

So no copy of a saved field outlives the next pass. Transient fields are the only state that lives only in memory. They hold per-tab state (section 6).

To make a pass cheaper, sapjs remembers the raw strings it read from an item record's attributes and bound text, and reads them again only after the page reports that element changed. sapjs has its own observer for this, so a change it hears about late or not at all still clears the copy. That copy is a string or `null` exactly as the DOM held it. A control's value is always read live. A plain record (no live control, transient field, nested list or scope, `calc:` or object value inside it) also keeps its row object between passes while its element and everything inside it are unchanged: the pass writes its declared fields back onto that object and skips walking it. A record that changed gets a new object, and properties a format added to a kept row stay on it until the row changes. A full pass (mount, `Sap.refresh()` or a live sync resync) drops every copy and every kept row. At 5,000 records in jsdom, a body edit reads 20,091 values instead of 50,085, and its pass takes 26.7 ms instead of 37.8 ms.

A live sync merge, an undo, a devtools edit and a keystroke all reach the app the same way. Each one changes the page, and the next pass reads the page. Undo and redo leave one gap, in controls a person typed into, and section 8, step 2 closes it.

## 2. When to use sapjs

A finished sapjs app is one `<main sap>` element with no render code: its records and views are declared in markup. The few commands that need JavaScript go in an inline handler or a short script.

Use sapjs attributes for:

- totals, counts, averages and anything else computed from records;
- lists that are sorted, filtered or grouped views of records;
- forms that add records, and editors that change the selected record;
- show and hide rules, classes and attributes that depend on data.

Use plain JavaScript, in an inline handler or a short script, for:

- the network, files and the clipboard;
- drawing on a canvas, and anything that needs a library;
- one-off commands, such as an import.

If the app is growing a large render function, a record field or an `each=` view was probably missed. Sections 4 and 5 cover both.

## 3. Start from the skeleton

This file loads ClayJS and sapjs, mounts the app inside `<main>` and prints one line in the console:

```html
<!doctype html>
<html lang="en" autosave>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Expenses</title>
  <style>
    [item][template] { display: none }
  </style>
</head>
<body>
  <main id="app" sap>
    …
  </main>
  <script src="https://clayjs.com/v1/clay.js?plugins=sync,sortable,undo,indicator&exclude=richclay"></script>
  <script src="https://clayjs.com/v1/clay-router.js"></script>
  <script src="https://clayjs.com/v1/sap.js"></script>
</body>
</html>
```

- `autosave` on `<html>` makes ClayJS save after edits, on a host that accepts saves. Cmd+S (Ctrl+S) saves without it.
- `sap` on `<main>` marks the app root. Every `[sap]` root mounts by itself on load. There is no init call.
- The `<style>` rule hides template rows. A template row is the `[item][template]` element in a list, which new records are cloned from. sapjs adds the same rule at runtime, but the file renders before any script runs, so write it yourself.
- `clay.js` saves and syncs the file. The plugin list loads live sync, drag sorting, undo and a save indicator.
- `clay-router.js` is optional. Keep it only when the app opens records through the URL hash (section 7).
- `exclude=richclay` leaves out ClayJS rich text. Remove it from the URL when the app has rich-text fields (section 7).
- `sap.js` is the sapjs build that ClayJS serves.

To run sapjs without saving, replace all the script tags with this one:

```html
<script src="https://cdn.jsdelivr.net/npm/@panphora/sapjs/dist/sap.min.js"></script>
```

Check that the app mounted. The console shows one line per app. For the tracker in section 9.1, it reads:

```
sap ✓ main[sap] · fields 5 · calcs 1 · paints 4 · actions 4 · lists 1 · rows 2 · warnings 0 · mount writes 0 · 12.7ms
```

The counts depend on the app, and the timing changes on every run. The app mounted when:

- The line starts with `sap ✓` and includes `mount writes 0`.
- `Sap.status().ok` is `true`.
- No element carries a `sap-error` attribute.

A failed app prints a `sap ✗` block for each error instead. Each block names the code, the element and the problem, and usually the attribute and the fix. A `sap ✗` summary line follows the blocks.

## 4. Design the records

A finished record is one element that carries all of its own data. This card has an id, a due date, a done flag and a title:

```html
<ol items="cards">
  <li item data-id="c-brief" state="data-due data-done:presence" data-due="2026-10-20">
    <span bind="title">Write the brief</span>
  </li>
</ol>
```

`items="cards"` on the container makes each `[item]` child a record in `state.cards`. Records must be direct children of that container. The record's fields come from `state=` declarations on the record element and from `bind` controls inside it.

The record element is a scope. A scope is an element that owns a set of fields: the `sap` root, an `[item]` record, a `detail=` panel, or any element with `scope=`. `scope=` marks an element as a scope that holds its own `state=` fields, like a record without a list. Expressions read the current record's fields as `item.NAME`, and `root.NAME` always reads the app root. Outside any record, `state.NAME` reads the nearest named scope, which is the app root when no `scope=` element sits between. Inside a record, write `item.NAME` and `root.NAME` rather than `state.NAME`, because `state.NAME` there resolves differently in a paint and in an action.

A text leaf is an element with no child elements, such as the `<span bind="title">` above.

| Field kind | Declare it | Read it as | Saved as |
|---|---|---|---|
| Text in a control or a text leaf | `bind` on an input, a textarea or a text leaf inside the record | `item.title` | the control's value or the leaf's text |
| A value with no visible control | `state="data-due"` on the record | `item.due` | `data-due="2026-10-20"` |
| A number | `state="data-points:num"` | `item.points` | `data-points="3"` |
| A yes/no flag that CSS selects on | `state="data-done:presence"` | `item.done` | `data-done` present or absent |
| A yes/no value stored as `true` or `false` | `state="data-flag:bool"` | `item.flag` | `data-flag="true"` or `data-flag="false"`. Choose it when CSS or code outside sapjs reads the attribute as the word (`[data-flag="true"]`). Expressions see a boolean either way. Choose `:presence` when CSS or code checks whether the attribute is there. |
| A nested list | `items="checks"` on a child container | `item.checks` | child `[item]` elements |

`bind` reads and writes a text leaf's text, but it does not make the text editable. Typing in place needs `contenteditable` on the leaf. Under ClayJS, write a saved leaf as `<span bind="title" editmode:contenteditable inert-contenteditable="plaintext-only">`, which becomes editable in edit mode only. Inside a `<template>`, write `editmode:contenteditable contenteditable="plaintext-only"` instead, because the edit-mode transform does not reach template content (ClayJS guide 4.4).

Three terms appear in the rules below:

- `Sap(el)` returns a proxy for the record that holds `el`, even when a `scope=` element sits between them. Outside any record, it returns the nearest `scope=` element, and otherwise the app root.
- `$key` is a record's `data-id`.
- `trigger-add="LIST"` makes a button or form add a record to LIST. `Sap(el).$add("LIST")` does the same from a script and returns the new record's proxy.

Rules for records:

- Put `state=` on the record element itself. sapjs reads `state=` only on a scope. On any other element it has no effect and reports no error.
- Give every record a `data-id`. Live sync pairs elements across tabs by it. Write `data-id=""` on the template row. Each new record then gets a fresh `data-id`, and fresh values for every `id` and `data-id` inside it.
- Use `data-*` attributes for fields with no control. They never collide with HTML's own attribute names. `state="data-due"` reads as `item.due`, the same way `el.dataset` does.
- Use `:presence` for flags. A `[data-done]` selector and `hasAttribute` then mean what they say. `:bool` writes the word `"false"`, and a presence selector still matches that.
- Write bare field names and `calc:` names as lowercase identifiers. HTML lowercases attribute names, and a hyphen in a name parses as subtraction. `state="due-date"` halts the app with `E08`, and `calc:due-date` or `bind="due-date"` fails at runtime with `E24` ("date is not defined"). A `data-*` field declared in `state=` is the exception: `data-due-date` is fine, and it reads in camelCase as `item.dueDate`.
- Put `persist` on every bound `<input>`, `<textarea>` and `<select>` in a record when the app runs on ClayJS. A typed value lives in the control's `value` property, and a save only sees attributes. `persist` writes the typed value into the attribute.

### Nested lists and shared blueprints

A record can hold a list of records. A Kanban list holds cards, and a card holds checklist items. Each nested list needs something to clone new records from.

Instead of a template row in every copy of the list, write one shared blueprint anywhere in the app. A shared blueprint is a `<template items="NAME">` element that holds one record:

```html
<template items="checks">
  <li item data-id="" state="data-done:presence"><span bind="label">New item</span></li>
</template>
```

Every `items="checks"` list that has no template row of its own clones from this blueprint. That includes lists inside other blueprints. A list's own template row still wins.

Three forms of template appear in this guide: the `template` attribute on a row inside a list, which new records in that list clone from; the shared `<template items="LIST">` blueprint, which every list of that name without a template row clones from; and the `<template>` inside an `each=` element, which draws each view row (section 5).

## 5. Build views over the records

A finished view shows the records in a different order or subset, and leaves the records alone. This list shows the open cards, soonest first, with a checkbox that ticks the card:

```html
<ul each="state.cards.filter(c => !c.done).sort((a, b) => a.due.localeCompare(b.due))">
  <template>
    <li><input type="checkbox" bind="done"> <span text="item.title"></span></li>
  </template>
</ul>
```

`each=` takes an expression that returns an array. sapjs clones the `<template>` once per array element and places the rows after it, in array order. Inside a row, `item` is the array element.

- Rows are matched by `key=`, which defaults to `item.$key`. A reorder moves the existing rows instead of rebuilding them, so focus and scroll inside a row survive.
- View rows carry `clay="editor-ui"`. ClayJS never saves or syncs them, and each tab draws its own. They never count as mount writes.
- A row that stands for a record edits that record. In the example, `bind="done"` reads the card's `data-done` and writes it back. A field the record owns reads from and writes to the record. Any other field reads and writes the scope that holds the `each=` element, such as `state.q` on the app root. This scoping rule applies to `bind` and `set:` alike. `set:` sets a field on click: `set:open="item.$key"` sets the `open` field to the row's key. A `bind` that matches neither is error `E43`.
- `trigger-remove` in a row removes the record. `Sap(el)` called on an element in a row returns the record's proxy.
- `calc:` does not run inside view rows. Compute the value on the record, or in the `each=` expression.

Filter in an `each=` view. Do not filter by putting `show=` on saved records. `show=` writes a `hidden` attribute into the record, and under ClayJS that attribute saves and syncs to every peer. Never remove a record to filter it either, because totals and counts read every record.

When the records themselves are the visible list, such as a board the user drags cards on, hide the non-matching records with a stylesheet. Paint the stylesheet into a `<style>` element inside the sap root, marked `clay="freeze"`. `clay="freeze"` marks a ClayJS region that saves its contents as they were at load, and never saves or syncs later changes. So the hiding rule stays in this tab. This example is for a board whose cards are a top-level `items="cards"` list:

```html
<main sap state="q:transient">
  <input type="search" bind="q" transient>
  <style clay="freeze" text="hideRule(state.cards, state.q)"></style>
  <ul items="cards">…</ul>
</main>
<script>
  function hideRule(cards, q) {
    const ids = cards.filter((c) => !c.title.toLowerCase().includes(q.toLowerCase())).map((c) => c.$key);
    return ids.length ? ids.map((id) => `[data-id="${CSS.escape(id)}"]`).join(",") + "{display:none}" : "";
  }
</script>
```

`text=` writes the helper's return value into the `<style>` element on every pass. `hideRule` returns one CSS rule that hides each card whose title does not contain the search text, or an empty string when every card matches. `state.q` is the search text, held in a transient field (section 6). The helper never touches a record. For cards nested in lists, as on the board in section 9.2, the helper receives `state.lists.flatMap((l) => l.cards)` instead of `state.cards`.

Keep the records as the main surface when the user edits structure. A `sortable` drag, rich text and in-place editing act on the elements they touch. View rows are never saved, so a drag inside a view moves nothing in the file. Make the records themselves the board or the table, and use views for everything secondary.

## 6. Put each kind of state in its place

Every value in a finished app belongs to one of three kinds, and each kind has one home:

| Kind | Example | Where it lives |
|---|---|---|
| Data | a card's title, an expense amount | record fields (section 4) |
| Per-tab | the search text, the open card, the active tab | `transient` fields, or the URL hash |
| Derived | totals, counts, the filtered list | `calc:`, paints and `each=` |

### Per-tab state

Declare per-tab fields `transient`. A transient field drives the app and is never written into the file:

```html
<main sap state="q:transient open:transient tab:transient=board">
  <input type="search" bind="q" transient>
```

The `=board` in `tab:transient=board` is the field's starting value. `transient` in a declaration keeps the field's attribute off the element. `transient` on a bound control strips its `value` attribute on every pass, so the search text never reaches the saved file.

A per-tab value that should survive a reload, or be shared as a link, goes in the URL hash instead. The ClayJS router keeps it there (section 7).

### Derived state

Compute derived values with `calc:` or an inline expression, and show them with paints (section 1):

```html
<output calc:total="sum(state.expenses, 'amount')" text:usd2="state.total">$54.50</output>
<span text="count(item.checks, c => c.done) + '/' + item.checks.length">1/2</span>
```

`calc:total` computes a field named `total`. `text:usd2` formats it as dollars with two decimals. In the `<span>`, `count(item.checks, c => c.done)` counts the card's ticked checklist items, so a card with one of two items ticked shows `1/2`.

Paint the computed values into the file. When the saved file already shows `$54.50`, the first pass changes nothing, and sapjs reports `mount writes 0`. When the file disagrees, sapjs paints the correct value at load. Under ClayJS, a painted value is derived: it never starts an autosave and never counts as unsaved. If the file's painted values still differ from the page after a repaint, for example because an agent wrote a record and left the old paint, one clean tab with autosave on saves the painted page. Without ClayJS, sapjs logs a `W30` warning and the value goes out with the next real save.

Where a paint goes depends on whether every tab computes the same value:

- A paint computed only from the records, such as a total or a count, is ordinary saved content. Under ClayJS a merge leaves painted values out and sapjs repaints them from the merged records, so two tabs that changed different records end with the right total and no conflict.
- Agents and data API rules read and write records, never painted values. A painted value on disk can lag its record until a tab repaints and saves it.
- A paint that differs per tab goes inside a `clay="freeze"` element (section 5). That covers anything computed from today's date, the browser's locale or the search box. Each tab fills its own copy. Section 7 explains why the wrapper is `clay="freeze"` and not `clay="editor-ui"`.

## 7. Edit one record in detail

In a finished app, clicking a card opens it for editing, and typing in the editor changes the card. There are two ways to build that.

### The record is the modal

Keep the detail fields inside the record element, hidden on the card face by CSS. When the record is open, show the record element itself as an overlay. The pattern is from ClayJS guide 9.5. It needs the `clay-router.js` line from the skeleton in section 3.

```html
<ol class="cards" items="cards" route="card">
  <li class="card" item data-id="c-brief">
    <h3 bind="title" onclick="clay.route.set({ card: Sap(this).$key })">Write the brief</h3>
    <div class="detail">
      <textarea bind="notes" persist></textarea>
      <button onclick="clay.route.set({ card: null })">Close</button>
    </div>
  </li>
</ol>
```

```css
.card .detail { display: none }
.card[route-active] .detail { display: block }
.card[route-active] { position: fixed; inset: 2rem; z-index: 10; overflow: auto; background: white }
```

- `route="card"` on the record container tells the router which records it opens. The router matches a record by its `data-id`.
- `clay.route.set({ card: id })` opens a record, and `clay.route.set({ card: null })` closes it. In the example, `Sap(this).$key` is the card's `data-id`.
- The router marks the open record with a `route-active` attribute that ClayJS never saves. The CSS shows the detail and turns the card into an overlay on that attribute.

Nothing is copied, so there is nothing to write back. A peer's edit to the open card appears in place. Rich text toolbars work. Back closes the card, and a reload keeps it open.

### A detail= editor

`detail="LIST by KEY"` projects one record into a panel or a dialog. Inside the panel, `item` is the open record. Controls inside it are painted from the record and write through to it:

```html
<main sap state="open:transient">
  …
  <div clay="freeze">
    <dialog detail="lists.cards by state.open">
      <input bind="title">
      <form method="dialog"><button>Close</button></form>
    </dialog>
  </div>
</main>
```

`state.open` holds the open card's `$key`. A `set:open="item.$key"` on each card sets it on click.

- The list path walks through nested lists. `lists.cards` finds a card in any list's `cards`.
- On a `<dialog>`, sapjs calls `showModal()` when a record matches the key and `close()` when none does.
- When the key is a plain `state.NAME`, as in `detail="lists.cards by state.open"`, closing the dialog by Esc or a `method="dialog"` button clears it. The next click on the same card opens it again.
- With any other key expression, Esc or a close button closes the dialog and leaves the key alone. The dialog stays closed until the key changes.
- Wrap every `detail=` panel in `clay="freeze"`, a `<div>` or `<article>` panel as well as a dialog. The panel's controls are painted with the open record's values. Outside a freeze wrapper, those values save as a second copy of the record. On a dialog, `showModal()` also writes an `open` attribute, and the wrapper keeps it out of the saved file. A dialog without a wrapper gets the warning `W31`.
- Use `clay="freeze"` for the wrapper, not `clay="editor-ui"`. `clay="freeze"` keeps the element in the file but saves it as it was at load, so painted values never reach the save. `clay="editor-ui"` removes the element from the saved file entirely, so the dialog would be gone after a reload.
- Declare the key `transient`. A saved key reopens the dialog for every visitor, and live sync opens it in every peer's tab.
- An `each=` inside the editor shows the record's nested list, and its rows edit those nested records. A `<form trigger-add>` inside the editor adds to the open record's list.
- On a `<div>` or `<article>`, `detail=` toggles `hidden` instead. Use that for a side panel.
- An `items=` list inside a `detail=` panel is a mount error (`E17`). Use `each=` there.

Use the record-as-modal shape when the detail holds rich text, needs a shareable link, or is the main editing surface. Use `detail=` when the fields are plain controls, or when the record must stay in its list while a panel edits it.

## 8. Work with ClayJS

With ClayJS loaded, a sapjs app saves, syncs and undoes as one file. Most of that takes no code. The rest is the five steps under "What you do".

What happens by itself:

- sapjs uses the ClayJS mutation hub, the single watcher ClayJS keeps for page changes. So its own paints never start an autosave and never enter the undo history.
- A live sync merge, an undo and a redo each run a full pass. After a merge the pass runs before ClayJS records any baseline.
- ClayJS treats what a paint writes as derived: the attribute an `attr:` names, the class token a `class:` names, the `--` property a `css:` names, the children of a `text` element, and `hidden` under `show`. Comparisons, the dirty check, undo and merges leave them out.
- ClayJS loads the sapjs core by itself on any page with a `[sap]` root: records and paints, without `calc:`, `each`, `detail`, `effect`, `invalid`, the actions and `Sap(el)`. Those halt with `E50`, which names full sapjs. Add the `sap.js` tag for them; the markup stays the same, and full sapjs takes the page over from the core.
- ClayJS mounts sapjs in a boot phase, after `clay="freeze"` regions record their markup and visitor drafts restore, and the boot baseline settles on the painted page.
- A route change from the ClayJS router fires `clay:route`, and sapjs runs a pass on it.
- `confirm=` uses `clay.confirm` when the `clay-ui.js` satellite is loaded. A satellite is an optional ClayJS script loaded beside `clay.js`.

What you do:

1. Put `persist` on bound `<input>`, `<textarea>` and `<select>` controls in records, so typed and chosen values reach the saved attributes.
2. Re-sync controls after an undo and a redo. The browser keeps a control's typed value separately from its `value` attribute, or from a textarea's text. Undo and redo restore only the markup, and sapjs reads the typed value. Without a re-sync, totals and the next save keep the stale typed value. A live sync merge moves the typed values itself, except in the control the person is typing in. This script re-syncs bound inputs, textareas and selects that carry `persist`. Add it after the `clay.js` and `sap.js` tags. Attach the listeners inside `clay.ready.then(...)`, because `clay.undo` does not exist until ClayJS has booted:

   ```js
   const app = document.querySelector("main[sap]");
   function syncControls() {
     for (const el of app.querySelectorAll("input[persist], textarea[persist], select[persist]")) {
       if (el.type === "checkbox" || el.type === "radio") { el.checked = el.hasAttribute("checked"); continue; }
       if (el.tagName === "SELECT") { for (const o of el.options) o.selected = o.hasAttribute("selected"); continue; }
       const saved = el.tagName === "TEXTAREA" ? (el.getAttribute("data-value") ?? el.textContent) : (el.getAttribute("value") ?? "");
       if (el.value !== saved) el.value = saved;
     }
     Sap.refresh();
   }
   clay.ready.then(() => {
     clay.undo?.on("undo", syncControls);
     clay.undo?.on("redo", syncControls);
   });
   ```

   The undo listeners need the ClayJS `undo` plugin (`?plugins=...,undo`), which the skeleton loads.
3. Put per-tab paints and every `detail=` panel in `clay="freeze"` (sections 5, 6 and 7).
4. Mark controls a script adds at runtime, such as toolbars and menus, `clay="editor-ui"`. View rows already are. ClayJS leaves `editor-ui` elements out of the saved file, so the script must build them again on every load, cloned from an unmarked `<template>`.
5. Show controls only in edit mode with `show-when:editmode="true"`. ClayJS sets `editmode` on `<html>` at load and removes it from every save. Nothing in the saved file hides these controls, so a viewer sees them until the scripts load. Add this rule to the stylesheet to keep them hidden before any script runs:

   ```css
   html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }
   ```

   In view mode, sapjs sets `hidden` on these controls at load unless the `clay-options` satellite has already started. That write logs a `W30` warning and a nonzero mount writes count for viewers. It is harmless: a viewer cannot save. In edit mode nothing is written.

## 9. Three worked apps

Each app below is a complete `<main sap>`, written with its computed values already painted, so it mounts with zero writes. Replace the skeleton's entire `<main>…</main>` element with one complete app below.

### 9.1 Expense tracker

A table of expenses, a form that adds them, and a total and a food subtotal.

```html app=tracker
<main id="app" sap>
  <form trigger-add="expenses">
    <input bind="what" placeholder="What" required>
    <input type="number" step="0.01" bind="amount" placeholder="0.00" required>
    <select bind="category" default="food"><option>food</option><option>travel</option><option>other</option></select>
    <button>Add</button>
  </form>
  <table>
    <tbody items="expenses">
      <tr item template data-id="" state="data-category">
        <td><input bind="what" persist></td>
        <td><input type="number" step="0.01" bind="amount" persist></td>
        <td text="item.category"></td>
        <td><button trigger-remove confirm="Delete this expense?">×</button></td>
      </tr>
      <tr item data-id="e-groc" state="data-category" data-category="food">
        <td><input bind="what" persist value="Groceries"></td>
        <td><input type="number" step="0.01" bind="amount" persist value="42.5"></td>
        <td text="item.category">food</td>
        <td><button trigger-remove confirm="Delete this expense?">×</button></td>
      </tr>
      <tr item data-id="e-train" state="data-category" data-category="travel">
        <td><input bind="what" persist value="Train"></td>
        <td><input type="number" step="0.01" bind="amount" persist value="12"></td>
        <td text="item.category">travel</td>
        <td><button trigger-remove confirm="Delete this expense?">×</button></td>
      </tr>
    </tbody>
  </table>
  <p>
    Total <output id="total" calc:total="sum(state.expenses, 'amount')" text:usd2="state.total">$54.50</output>,
    food <output id="food" text:usd2="sum(state.expenses.filter(e => e.category === 'food'), 'amount')">$42.50</output>
  </p>
</main>
```

- The form is a composer: a form whose bound controls fill a new record, which `trigger-add` then adds. On submit, it clones the template row and copies each of its bound controls into the new record's field of the same name. `category` lands in the `data-category` field that the record declares. Then the form clears itself and puts focus back in the first field. `default="food"` puts the select back on food after each add; without it the select clears to no choice, and the next expense saves with no category.
- `amount` is a number because its input is `type="number"`.
- `required` on the form's inputs blocks an empty submit with no code.
- `confirm=` asks before deleting. It uses `clay.confirm` when the ClayJS `clay-ui.js` satellite is loaded, and `window.confirm` otherwise.

### 9.2 Kanban board

Two lists of cards, a checklist on each card, shared blueprints, and a card editor in a dialog.

The lists and cards inside `<section items="lists">` are the records. The two `<template items=...>` elements after the section are the shared blueprints. The `<dialog>` is the editor.

```html app=kanban
<main id="board" sap state="open:transient">
  <section items="lists">
    <div class="list" item data-id="l-todo">
      <h2 bind="name">To do</h2>
      <ol class="cards" items="cards" sortable="cards">
        <li class="card" item data-id="c-brief" state="data-title" data-title="Write the brief" set:open="item.$key">
          <span text="item.title">Write the brief</span>
          <small text="count(item.checks, c => c.done) + '/' + item.checks.length">1/2</small>
          <ul class="checks" hidden items="checks">
            <li item data-id="k-outline" state="data-label data-done:presence" data-label="Outline" data-done></li>
            <li item data-id="k-draft" state="data-label data-done:presence" data-label="Draft"></li>
          </ul>
        </li>
      </ol>
      <button class="add-card" trigger-add="cards">+ Add a card</button>
    </div>
    <div class="list" item data-id="l-done">
      <h2 bind="name">Done</h2>
      <ol class="cards" items="cards" sortable="cards"></ol>
      <button class="add-card" trigger-add="cards">+ Add a card</button>
    </div>
  </section>

  <template items="cards">
    <li class="card" item data-id="" state="data-title" data-title="New card" set:open="item.$key">
      <span text="item.title">New card</span>
      <small text="count(item.checks, c => c.done) + '/' + item.checks.length">0/0</small>
      <ul class="checks" hidden items="checks"></ul>
    </li>
  </template>
  <template items="checks">
    <li item data-id="" state="data-label data-done:presence"></li>
  </template>

  <div clay="freeze">
    <dialog detail="lists.cards by state.open">
      <input class="title" bind="title">
      <ul each="item.checks">
        <template><li><input type="checkbox" bind="done"> <input class="label" bind="label"></li></template>
      </ul>
      <form trigger-add="checks"><input class="new-check" bind="label" placeholder="Add an item"></form>
      <form method="dialog"><button>Close</button></form>
    </dialog>
  </div>
</main>
```

- The lists and cards are the records, and they are also the visible board. A `sortable` drag moves the real card elements.
- `sortable="cards"` turns on ClayJS drag sorting. A drag reorders the `cards` list, and can move a card into any other list with the same name.
- Each card keeps its checklist inside itself, in a `hidden` list that saves with the card. A dragged or synced card carries all of its data.
- The "Done" list has no cards and no template row. Its "+ Add a card" button clones the shared `cards` blueprint.
- Clicking a card sets the transient `open` key to the card's `$key`. The dialog opens on that card, in whichever list holds it.
- Inside the dialog, `item` is the open card. So `bind="title"` writes the card's `data-title`, and `each="item.checks"` is a view of the card's checklist whose rows edit those records. Ticking a box adds or removes that item's `data-done`.
- The `trigger-add="checks"` form adds a checklist item to the open card, cloned from the shared `checks` blueprint.
- Closing the dialog clears `open`, so the next click on the same card opens it again.

### 9.3 Notes

A searchable, sorted list of notes, and an editor for the selected note.

```html app=notes
<main id="notes" sap state="q:transient open:transient">
  <input id="q" type="search" bind="q" transient placeholder="Search">
  <button id="new" onclick="const s = Sap(this); s.open = s.$add('notes').$key">New note</button>

  <section items="notes" hidden>
    <article item template data-id=""><h3 bind="title">Untitled</h3><div bind="body"></div></article>
    <article item data-id="n-ideas"><h3 bind="title">Ideas</h3><div bind="body">A board for recipes</div></article>
    <article item data-id="n-books"><h3 bind="title">Books</h3><div bind="body">Read the ClayJS guide</div></article>
  </section>

  <nav id="list" each="state.notes.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(state.q.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title))">
    <template><a set:open="item.$key" class:on="state.open === item.$key" text="item.title"></a></template>
  </nav>

  <div clay="freeze">
    <article id="editor" detail="notes by state.open" hidden>
      <input bind="title">
      <textarea bind="body"></textarea>
      <button trigger-remove confirm="Delete this note?">Delete</button>
    </article>
  </div>
</main>
```

- The notes are saved records in a `hidden` section. The visible list is an `each=` view that filters and sorts in its expression, so typing in the search box never writes to a note.
- The editor is a `detail=` panel. Its list path is `notes`, because a top-level list's path is just its name. `lists.cards` in section 9.2 is how a path reaches a nested list.
- Typing in the editor writes through to the selected note, and its `trigger-remove` deletes that note.
- The editor sits inside `clay="freeze"`, so the open note's values painted into its controls never save.
- "New note" calls `Sap(this)` from a handler. The button sits outside any record, so `Sap(this)` resolves to the app root. `$add('notes')` clones the template and returns the new note's proxy, and setting `open` to its `$key` opens it in the editor.

## 10. Checklist and traps

Before calling an app done, check each item. The console's "mount writes N" and `Sap.status().apps[0].mountWrites` are the same count.

- [ ] The console shows a `sap ✓` line for every app, and `Sap.status().ok` is `true`.
- [ ] No element carries `sap-error`.
- [ ] `Sap.status().apps[0].mountWrites` is `0` in edit mode on the saved file, because the computed values are painted into it. In view mode, a root with `show-when` controls is the one exception (section 8, step 5).
- [ ] Every record has a `data-id`, and every template row has `data-id=""`.
- [ ] The search text, the open record and the active tab are `transient` or in the URL hash.
- [ ] No saved record carries `show=`. Views filter in `each=`.
- [ ] Every `detail=` panel, dialog or not, sits inside `clay="freeze"` and uses a `transient` key.
- [ ] Bound `<input>`, `<textarea>` and `<select>` controls in records carry `persist` (ClayJS apps).
- [ ] The app still works after an undo and after a peer's edit.

Traps, keyed by what you see:

| Symptom | Cause | Fix |
|---|---|---|
| `state=` has no effect, and no error appears | it sits on an element that is not a scope (`sap`, `scope=`, `[item]`, `[detail]`) | move it to the record, or add `scope=` |
| `state="due-date"` halts the app with `E08`, or `calc:due-date` fails with `E24` | the hyphen parses as subtraction | name it `data-due-date` in `state=` and read it as `item.dueDate`, or use one lowercase word |
| a flag still reads true after unticking | `:bool` wrote `"false"`, and CSS or code checks presence | declare it `:presence` |
| a bound `<span>` shows the text but cannot be typed in | `bind` does not make a text leaf editable | add `contenteditable`, or under ClayJS `editmode:contenteditable inert-contenteditable="plaintext-only"` (section 4) |
| `E43` on a `bind` in a view row | the field belongs neither to the record nor to the scope that holds the `each=` element | declare it on the record, or with `state=` on that scope |
| typing in a view row changes nothing in the file | the row's field resolves to per-tab state | declare the field on the record to save it |
| filtered-out records are saved and synced with `hidden` | `show=` on saved records writes `hidden` | filter in an `each=` view, or paint a hiding rule into a frozen `<style>` (section 5) |
| the editor dialog opens for every visitor | the key is saved | declare it `transient` |
| the saved file holds the open record's values a second time, in the editor's controls | the `detail=` panel is outside `clay="freeze"` | wrap it in `clay="freeze"` |
| the dialog is missing after a save | it was inside `clay="editor-ui"` | wrap it in `clay="freeze"` |
| `W31` on a dialog | the `<dialog detail>` has no `clay="freeze"` ancestor | wrap it in `clay="freeze"` |
| a computed value read right after a write is stale | `calc:` values and paints update in the next pass, which runs after your code returns | call `Sap.refresh()` before reading |
| a total keeps an old number after an undo or a redo | the attribute was restored, not the control's on-screen value | add `syncControls` (section 8, step 2) |
| `W30` and a nonzero mount writes count for viewers, in a root with `show-when` controls | in view mode sapjs sets `hidden` on them, unless `clay-options` has already started | nothing; a viewer cannot save, and in edit mode nothing is written |
| every expression fails under a strict CSP | expressions compile with `new Function` | allow `unsafe-eval`, or build the app without sapjs |
