import { mount, Sap } from './helpers/mount.js';
import { runPass } from '../src/pass.js';
import { settle } from './helpers/intake-sequences.js';
import { writeTransient } from '../src/dom.js';
import { dropPlans } from '../src/plan.js';

async function fixture(html) {
  const root = mount(html);
  await settle();
  const app = Sap._registry.get(root);
  expect(app.halted).toBeFalsy();
  return { root, app };
}

afterEach(() => {
  Sap._reset();
  delete Sap.formats.lock;
});

test('presence declaration must not replace a winning leaf bind on the cached pass', async () => {
  const { root, app } = await fixture(`<main sap><ul items="rows"><li item data-id="a" state="data-done:presence" data-done><span bind="done">Ready</span></li></ul><output text="state.rows[0].done">Ready</output></main>`);
  runPass(app, { cacheReads: false });
  expect(app._state.rows[0].done).toBe('Ready');
  runPass(app, {});
  expect(app._state.rows[0].done).toBe('Ready');
  expect(root.querySelector('output').textContent).toBe('Ready');
});

test('a readonly field added by a format must not crash a later pass', async () => {
  Sap.formats.lock = rows => rows.map(row => {
    Object.defineProperty(row, 'title', { writable: false });
    return row.title;
  }).join(',');
  const { app } = await fixture(`<main sap><ul items="rows"><li item data-id="a"><span bind="title">Alpha</span></li></ul><output text="fmt.lock(state.rows)">Alpha</output></main>`);
  expect(() => runPass(app, {})).not.toThrow();
});

test('pending defaults replay when a visibility directive appears elsewhere', async () => {
  const { root, app } = await fixture(`<main sap><ul items="rows"><li item data-id="a" state="data-mode=ready"><span bind="title">Alpha</span></li></ul><output></output></main>`);
  const row = root.querySelector('[item]');
  expect(row.hasAttribute('data-mode')).toBe(false);
  root.querySelector('output').setAttribute('show-when:data-mode', 'ready');
  runPass(app, {});
  expect(row.getAttribute('data-mode')).toBe('ready');
  row.setAttribute('data-mode', 'changed');
  runPass(app, {});
  runPass(app, {});
  expect(row.getAttribute('data-mode')).toBe('changed');
  expect(app._state.rows[0].mode).toBe('changed');
});

test('radio groups and direct transient writes remain live without mutation records', async () => {
  const { root, app } = await fixture(`<main sap><ul items="rows"><li item data-id="a"><input type="radio" name="x" value="a" bind="choice" checked></li><li item data-id="b"><input type="radio" name="x" value="b" bind="choice"></li><li item data-id="t" state="data-value:transient=old"></li></ul></main>`);
  root.querySelector('[value="b"]').checked = true;
  writeTransient(root.querySelector('[data-id="t"]'), { name: 'value', attr: 'data-value', transient: true, type: 'string' }, 'new');
  runPass(app, {});
  expect(app._state.rows.map(r => r.choice ?? r.value)).toEqual(['', 'b', 'new']);
});

test('row moves, same-id replacements and detached edits get current fields and context', async () => {
  const { root, app } = await fixture(`<main sap><section scope="a" state="prefix=A"><ul items="rows"><li item data-id="r" state="data-mode=one"><span bind="title">Alpha</span><b text="state.prefix + item.title">AAlpha</b></li></ul></section><section scope="b" state="prefix=B"><ul items="rows"></ul></section></main>`);
  const row = root.querySelector('[item]');
  root.querySelector('[scope="b"] ul').append(row);
  runPass(app, {});
  expect(app._state.a.rows).toHaveLength(0);
  expect(app._state.b.rows[0].$index).toBe(0);
  expect(row.querySelector('b').textContent).toBe('BAlpha');
  row.remove();
  await settle();
  row.querySelector('span').textContent = 'Edited';
  row.removeAttribute('state');
  root.querySelector('[scope="a"] ul').append(row);
  runPass(app, {});
  expect(app._state.a.rows[0].title).toBe('Edited');
  expect(app._state.a.rows[0]).not.toHaveProperty('mode');
  row.outerHTML = '<li item data-id="r"><span bind="title">Replacement</span></li>';
  runPass(app, {});
  expect(app._state.a.rows[0].title).toBe('Replacement');
});

test('each and detail write through into a kept plain row, and missing binds keep E43', async () => {
  const { root, app } = await fixture(`<main sap state="selected=a"><ul items="rows"><li item data-id="a" state="data-title=Alpha"></li></ul><nav each="state.rows"><template><div><input bind="title"><input bind="missing"></div></template></nav><aside detail="rows by state.selected"><input bind="title"></aside></main>`);
  const before = app._state.rows[0];
  runPass(app, {});
  // The row a detail panel shows is read fresh each pass, since the panel may write onto it.
  expect(app._state.rows[0]).not.toBe(before);
  expect(app._state.rows[0]).toEqual(before);
  expect(app.diag.errors.map(e => e.code)).toEqual(['E43']);
  const input = root.querySelector('aside input');
  input.value = 'Beta';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  expect(app._state.rows[0].title).toBe('Beta');
  expect(root.querySelector('nav input').value).toBe('Beta');
  expect(Sap(root.querySelector('[item]')).title).toBe('Beta');
  runPass(app, {});
  expect(app.diag.errors.map(e => e.code)).toEqual(['E43']);
});

test('dropPlans rejects a kept row and reads every descendant plan again', async () => {
  const { app } = await fixture(`<main sap><ul items="rows"><li item data-id="a"><span bind="title">Alpha</span></li></ul></main>`);
  const before = app._state.rows[0];
  dropPlans();
  runPass(app, {});
  expect(app._state.rows[0]).not.toBe(before);
  expect(app._state.rows[0].title).toBe('Alpha');
});

test('another document does not reuse rows', () => {
  const doc = document.implementation.createHTMLDocument('other');
  doc.body.innerHTML = '<main sap><ul items="rows"><li item data-id="a"><span bind="title">Alpha</span></li></ul></main>';
  const root = doc.querySelector('main');
  const app = Sap.mount(root);
  const before = app._state.rows[0];
  root.querySelector('span').textContent = 'Beta';
  runPass(app, {});
  expect(app._state.rows[0]).not.toBe(before);
  expect(app._state.rows[0].title).toBe('Beta');
});

test('engine text writes inside a row are read by the next intake', async () => {
  const { root, app } = await fixture(`<main sap state="prefix=Alpha"><ul items="rows"><li item data-id="a"><span bind="title" text="state.prefix">Alpha</span></li></ul></main>`);
  root.setAttribute('prefix', 'Beta');
  runPass(app, {});
  runPass(app, {});
  expect(app._state.rows[0].title).toBe('Beta');
});

test('effects and validation on a cached row use this pass state', async () => {
  const { root, app } = await fixture(`<main sap state="msg=old"><ul items="rows"><li item data-id="a" state="data-title=Alpha"><input invalid="state.msg"><i effect="el.result = state.msg"></i></li></ul></main>`);
  const before = app._state.rows[0];
  root.setAttribute('msg', 'new');
  runPass(app, {});
  expect(app._state.rows[0]).toBe(before);
  expect(root.querySelector('i').result).toBe('new');
  expect(root.querySelector('input').validationMessage).toBe('new');
});
