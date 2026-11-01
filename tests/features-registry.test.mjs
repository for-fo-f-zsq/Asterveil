import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
function loader() {
  const cache = new Map();
  function load(path) {
    path = resolve(root, path);
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    runInNewContext(
      ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        URL,
        AbortController,
        console,
        require(name) {
          if (name === './edition') return { editorName: 'Markdown Editor', pdfEnabled: false };
          return name.startsWith('.') ? load(resolve(dirname(path), `${name}.ts`)) : require(name);
        },
      },
    );
    return exports;
  }
  return load;
}
const load = loader();
const { modules } = load('src/features/registry.ts');
const { defaultSettings } = load('src/shared/settings.ts');

const helperIds = [
  'homework',
  'copy-problem',
  'submission-code',
  'ranking-filters',
  'contest-review',
  'page-tidy',
  'tips',
  'chat-markdown',
];

function disabled(...ids) {
  const settings = defaultSettings();
  return {
    ...settings,
    modules: { ...settings.modules, ...Object.fromEntries(ids.map((id) => [id, false])) },
  };
}

test('helper features replace the single ui-helpers module', () => {
  const ids = modules.map(({ id }) => id);
  assert.equal(ids.includes('ui-helpers'), false);
  assert.deepEqual([...ids].sort(), [...helperIds, 'user-names', 'local-avatars'].sort());
});

test('every helper feature follows the ui-helpers master switch and its own switch', () => {
  const byId = new Map(modules.map((module) => [module.id, module]));
  for (const id of helperIds) {
    const { enabled } = byId.get(id);
    assert.equal(typeof enabled, 'function', `${id} needs an enabled predicate`);
    assert.equal(enabled(defaultSettings()), true);
    assert.equal(enabled(disabled('ui-helpers')), false);
    assert.equal(enabled(disabled(id)), false);
    assert.equal(enabled(disabled('ui-helpers', id)), false);
  }
  for (const id of ['user-names', 'local-avatars']) {
    assert.equal(byId.get(id).enabled, undefined);
    assert.equal(byId.get(id).matches(new URL('https://jx.7fa4.cn/')), true);
  }
});

test('helper features match exactly the pages they enhance', () => {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const cases = {
    homework: ['/problem/1000'],
    'copy-problem': ['/problem/1000', '/contest/12/problem/1000'],
    'submission-code': ['/submission/1'],
    'ranking-filters': ['/progress/quiz', '/progress/contests', '/progress/contest_table/html'],
    'contest-review': ['/contest/12'],
    'page-tidy': [
      '/login',
      '/vjudge/accounts',
      '/user_plans/1',
      '/user/1/friend',
      '/progress/quiz',
      '/user_tag_map',
      '/user/1/schedule',
    ],
    tips: ['/problem/1000'],
    'chat-markdown': ['/chat'],
  };
  for (const [id, paths] of Object.entries(cases)) {
    for (const path of paths) {
      assert.equal(
        byId.get(id).matches(new URL(`https://jx.7fa4.cn${path}`)),
        true,
        `${id} ${path}`,
      );
    }
  }
  assert.equal(byId.get('copy-problem').matches(new URL('https://jx.7fa4.cn/submission/1')), false);
  assert.equal(
    byId.get('contest-review').matches(new URL('https://jx.7fa4.cn/contest/12/problem/1000')),
    false,
  );
  assert.equal(byId.get('page-tidy').matches(new URL('https://jx.7fa4.cn/user/1')), false);
  assert.equal(
    byId.get('chat-markdown').matches(new URL('https://jx.7fa4.cn/problem/1000')),
    false,
  );
});
