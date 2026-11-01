import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
function loader(globals = {}) {
  const cache = new Map();
  function load(path) {
    path = resolve(root, path);
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const source = readFileSync(path, 'utf8');
    runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        console,
        AbortController,
        URL,
        require(name) {
          if (name.endsWith('?inline')) return { default: '' };
          if (name === './edition') return { editorName: 'Markdown Editor', pdfEnabled: false };
          return name.startsWith('.') ? load(resolve(dirname(path), `${name}.ts`)) : require(name);
        },
        ...globals,
      },
    );
    return exports;
  }
  return load;
}
const load = loader();
const model = load('src/shared/home-layout.ts');
const { defaultSettings, decodeSettings } = load('src/shared/settings.ts');
const { isSettingsRequest } = load('src/shared/protocol.ts');
const { createSettingsService } = load('src/background/settings-service.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('old settings gain a complete default layout without changing existing module choices', () => {
  const old = plain(defaultSettings());
  delete old.homeLayout;
  delete old.modules['home-layout'];
  old.modules.homework = false;
  const decoded = decodeSettings(old);
  assert.equal(decoded.homeLayout.length, 12);
  assert.equal('home-layout' in decoded.modules, false);
  assert.equal(decoded.modules.homework, false);
  const partial = model.decodeHomeLayout([{ id: 'timer', column: 'main', visible: false }]);
  assert.equal(partial.length, 12);
  assert.deepEqual(plain(partial[0]), { id: 'timer', column: 'main', visible: false });
});

test('reject malformed layouts and untrusted commands', () => {
  for (const bad of [
    null,
    {},
    [{ id: 'fake', column: 'main', visible: true }],
    [{ id: 'today', column: 'other', visible: true }],
    [{ id: 'today', column: 'main', visible: 1 }],
    [model.defaultHomeLayout()[0], model.defaultHomeLayout()[0]],
  ]) {
    assert.throws(() => model.decodeHomeLayout(bad));
  }
  for (const command of [
    { type: 'settings.home.visible', id: 'today', visible: 'false' },
    { type: 'settings.home.move', id: 'today', column: 'other', before: null },
    { type: 'settings.home.move', id: 'today', column: 'main', before: 'unknown' },
  ])
    assert.equal(isSettingsRequest({ channel: 'asterveil', ...command }), false);
});

test('serialized hide and move commands preserve one another and unrelated settings', async () => {
  let stored = defaultSettings();
  const initial = stored;
  const service = createSettingsService({
    read: async () => stored,
    write: async (value) => {
      stored = value;
    },
  });
  await Promise.all([
    service({ type: 'settings.home.visible', id: 'timer', visible: false }),
    service({ type: 'settings.home.move', id: 'timer', column: 'main', before: 'today' }),
    service({ type: 'settings.accent', color: '#cf5683' }),
  ]);
  assert.deepEqual(plain(stored.homeLayout[0]), { id: 'timer', column: 'main', visible: false });
  assert.equal(stored.revision, 3);
  assert.equal(stored.accentColor, '#cf5683');
  await service({ type: 'settings.home.reset' });
  assert.deepEqual(plain(stored.homeLayout), plain(initial.homeLayout));
  assert.equal(stored.accentColor, '#cf5683');
});

function fixture() {
  const pair = ({ title, id }) =>
    `<h4 class="ui top attached block header"><i></i>${title}</h4><div class="ui bottom attached segment" id="block-${id}"><button>刷新</button></div>`;
  const { document, window } = parseHTML(
    `<html><head></head><body><div class="ui main container"><div class="padding"><div class="ui three column grid"><div class="ten wide column">${model.homeSections
      .filter((s) => s.column === 'main')
      .map(pair)
      .join('')}</div><div class="six wide column">${model.homeSections
      .filter((s) => s.column === 'side')
      .map(pair)
      .join(
        '',
      )}<h4 class="ui top attached block header">未知板块</h4><div class="ui bottom attached segment" id="unknown">保留</div></div></div></div></body></html>`,
  );
  const frames = new Map();
  let sequence = 0;
  const local = loader({
    document,
    window,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    MutationObserver: window.MutationObserver,
    requestAnimationFrame: (fn) => {
      frames.set(++sequence, fn);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  });
  const { Scope } = local('src/core/scope.ts');
  const scope = new Scope();
  const commands = [];
  const adapter = local('src/site/home-layout.ts').createHomeLayout(scope, async (command) => {
    commands.push(command);
  });
  const settings = defaultSettings();
  const main = document.querySelector('.ten.column');
  const side = document.querySelector('.six.column');
  const initial = document.querySelector('.padding').innerHTML;
  const update = (homeLayout) =>
    adapter.update(new URL('https://jx.7fa4.cn:8888/'), { ...settings, homeLayout });
  const bar = () => document.querySelector('.asterveil-home-editor');
  const headingOf = (id) => document.querySelector(`#block-${id}`).previousElementSibling;
  const click = (element) => element.dispatchEvent(new window.Event('click', { bubbles: true }));
  const press = (element, key) => {
    const event = new window.Event('keydown', { bubbles: true });
    Object.defineProperty(event, 'key', { value: key });
    element.dispatchEvent(event);
  };
  async function flush() {
    await Promise.resolve();
    for (const [id, fn] of frames) {
      frames.delete(id);
      fn();
    }
    await Promise.resolve();
  }
  return {
    document,
    window,
    scope,
    adapter,
    settings,
    main,
    side,
    initial,
    update,
    bar,
    headingOf,
    click,
    press,
    commands,
    flush,
  };
}

test('moves intact header/body pairs, retains listeners and restores exact original markup', () => {
  const f = fixture();
  const button = f.document.querySelector('#block-timer button');
  let clicks = 0;
  button.addEventListener('click', () => clicks++);
  let layout = model.moveHomeSection(f.settings.homeLayout, 'timer', 'main', 'today');
  layout = layout.map((item) => (item.id === 'recent' ? { ...item, visible: false } : item));
  f.update(layout);
  assert.equal(f.main.firstElementChild.textContent, '计时器');
  assert.equal(f.main.children[1].id, 'block-timer');
  assert.equal(f.document.querySelector('#block-timer button'), button);
  button.click();
  assert.equal(clicks, 1);
  assert.equal(f.document.querySelector('#block-recent').hasAttribute('data-av-home-hidden'), true);
  assert.equal(f.document.querySelector('#unknown').parentElement, f.side);
  f.update(model.defaultHomeLayout());
  assert.equal(f.document.querySelector('.padding').innerHTML, f.initial);
  f.scope.dispose();
});

test('all-hidden mode remains recoverable and empty columns collapse', () => {
  const f = fixture();
  f.document.querySelector('#unknown').previousElementSibling.remove();
  f.document.querySelector('#unknown').remove();
  f.update(f.settings.homeLayout.map((item) => ({ ...item, visible: false })));
  assert.ok(f.document.querySelector('.asterveil-home-empty'));
  assert.ok(f.main.hasAttribute('data-av-home-empty'));
  f.update(f.settings.homeLayout.map((item) => ({ ...item, visible: item.id === 'today' })));
  assert.ok(f.main.parentElement.hasAttribute('data-av-home-single'));
  assert.equal(f.document.querySelector('.asterveil-home-empty'), null);
  f.adapter.update(new URL('https://jx.7fa4.cn:8888/'), { ...f.settings, enabled: false });
  assert.equal(f.document.querySelector('[data-av-home-hidden]'), null);
  f.scope.dispose();
});

test('repeated changes, navigation and disposal restore original order', () => {
  const f = fixture();
  f.update(model.moveHomeSection(f.settings.homeLayout, 'today', 'side', 'progress'));
  f.update(model.moveHomeSection(f.settings.homeLayout, 'best', 'side', null));
  f.adapter.update(new URL('https://jx.7fa4.cn:8888/problems'), f.settings);
  assert.equal(f.document.querySelector('.padding').innerHTML, f.initial);
  f.update(model.moveHomeSection(f.settings.homeLayout, 'timer', 'main', null));
  f.scope.dispose();
  assert.equal(f.document.querySelector('.padding').innerHTML, f.initial);
});

test('handles replaced block content without resurrecting removed nodes', async () => {
  const f = fixture();
  const layout = model
    .moveHomeSection(f.settings.homeLayout, 'timer', 'main', 'today')
    .map((item) => (item.id === 'timer' ? { ...item, visible: false } : item));
  f.update(layout);
  const old = f.document.querySelector('#block-timer');
  const replacement = f.document.createElement('div');
  replacement.className = 'ui bottom attached segment';
  replacement.id = 'replacement';
  old.replaceWith(replacement);
  await f.flush();
  assert.ok(replacement.hasAttribute('data-av-home-hidden'));
  f.scope.dispose();
  assert.equal(old.isConnected, false);
  assert.ok(replacement.isConnected);
  assert.equal(replacement.parentElement, f.side);
  assert.equal(replacement.previousElementSibling.textContent, '计时器');
});

test('reapplies saved layout after the site replaces the grid', async () => {
  const f = fixture();
  const layout = model.moveHomeSection(f.settings.homeLayout, 'timer', 'main', 'today');
  f.update(layout);
  f.document.querySelector('.padding').innerHTML = f.initial;
  await f.flush();
  const main = f.document.querySelector('.ten.column');
  assert.equal(main.firstElementChild.textContent, '计时器');
  f.scope.dispose();
  assert.equal(f.document.querySelector('.padding').innerHTML, f.initial);
});

test('the homepage entry opens an editor and hides sections on demand', async () => {
  const f = fixture();
  f.update(f.settings.homeLayout);
  const bar = f.bar();
  assert.ok(bar);
  assert.equal(bar.parentElement, f.document.body);
  assert.equal(
    bar.querySelector('.asterveil-home-edit').getAttribute('aria-label'),
    '调整首页板块',
  );
  assert.equal(f.document.querySelector('.asterveil-home-grip'), null);

  f.click(bar.querySelector('.asterveil-home-edit'));
  const grid = f.document.querySelector('.ui.grid');
  assert.ok(grid.hasAttribute('data-av-home-editing'));
  assert.equal(bar.querySelector('.asterveil-home-actions').hidden, false);
  assert.equal(f.document.querySelectorAll('.asterveil-home-grip').length, 12);
  assert.equal(f.document.querySelectorAll('.asterveil-home-eye').length, 12);

  const eye = f.headingOf('timer').querySelector('.asterveil-home-eye');
  assert.equal(eye.getAttribute('aria-pressed'), 'true');
  f.click(eye);
  await f.flush();
  assert.deepEqual(plain(f.commands[0]), {
    type: 'settings.home.visible',
    id: 'timer',
    visible: false,
  });
  assert.equal(eye.getAttribute('aria-pressed'), 'false');
  assert.ok(f.document.querySelector('#block-timer').hasAttribute('data-av-home-hidden'));

  f.update(
    f.settings.homeLayout.map((item) => (item.id === 'timer' ? { ...item, visible: false } : item)),
  );
  assert.ok(f.document.querySelector('#block-timer').hasAttribute('data-av-home-hidden'));
  f.scope.dispose();
});

test('the grip reorders sections with arrow keys', async () => {
  const f = fixture();
  f.update(f.settings.homeLayout);
  f.click(f.bar().querySelector('.asterveil-home-edit'));

  f.press(f.headingOf('recent').querySelector('.asterveil-home-grip'), 'ArrowUp');
  await f.flush();
  assert.deepEqual(plain(f.commands.at(-1)), {
    type: 'settings.home.move',
    id: 'recent',
    column: 'main',
    before: 'today',
  });

  f.press(f.headingOf('today').querySelector('.asterveil-home-grip'), 'ArrowRight');
  await f.flush();
  assert.deepEqual(plain(f.commands.at(-1)), {
    type: 'settings.home.move',
    id: 'today',
    column: 'side',
    before: null,
  });

  f.press(f.headingOf('links').querySelector('.asterveil-home-grip'), 'Home');
  await f.flush();
  assert.deepEqual(plain(f.commands.at(-1)), {
    type: 'settings.home.move',
    id: 'links',
    column: 'side',
    before: 'notifications',
  });
  f.scope.dispose();
});

test('reset restores the default order and finishing leaves original markup', async () => {
  const f = fixture();
  const custom = f.settings.homeLayout.map((item) =>
    item.id === 'timer' ? { ...item, visible: false } : item,
  );
  f.update(custom);
  f.click(f.bar().querySelector('.asterveil-home-edit'));
  assert.ok(f.document.querySelector('.ui.grid').hasAttribute('data-av-home-editing'));

  f.click(f.bar().querySelector('.asterveil-home-reset'));
  await f.flush();
  assert.deepEqual(plain(f.commands.at(-1)), { type: 'settings.home.reset' });
  f.update(f.settings.homeLayout);

  f.click(f.bar().querySelector('.asterveil-home-done'));
  assert.equal(f.document.querySelector('[data-av-home-layout]'), null);
  assert.equal(f.document.querySelector('.asterveil-home-grip'), null);
  assert.equal(f.bar().querySelector('.asterveil-home-actions').hidden, true);
  assert.equal(f.bar().classList.contains('is-editing'), false);
  assert.equal(f.document.querySelector('.padding').innerHTML, f.initial);
  f.scope.dispose();
});

test('the entry stays off other pages and when the extension is disabled', () => {
  const f = fixture();
  f.adapter.update(new URL('https://jx.7fa4.cn:8888/problems'), f.settings);
  assert.equal(f.bar(), null);
  f.adapter.update(new URL('https://jx.7fa4.cn:8888/'), { ...f.settings, enabled: false });
  assert.equal(f.bar(), null);
  f.scope.dispose();
});
