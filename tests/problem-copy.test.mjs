import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as marked from 'marked';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
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
      crypto: { randomUUID },
      require(name) {
        if (name === 'marked') return marked;
        if (name === './edition') return { editorName: 'Markdown Editor', pdfEnabled: false };
        return load(resolve(dirname(path), `${name}.ts`));
      },
    },
  );
  return exports;
}
const { problemDescription } = load('src/site/problem-description.ts');

test('description copying excludes surrounding sections and preserves code, formulas and subheadings', () => {
  const description = [
    '计算 $a+b$。',
    '',
    '```markdown',
    '## 输入格式',
    '这是描述中的代码，不能截断。',
    '```',
    '',
    '### 补充说明',
    '',
    '$$a+b=c$$',
    '',
    '[参考][ref]',
    '',
    '[ref]: https://example.com/problem',
  ].join('\n');
  const source = `# 题目名称\n\n背景信息\n\n## 题目描述\n\n${description}\n\n## 输入格式\n不应复制\n\n## 输出格式\n不应复制`;
  assert.equal(problemDescription(source), description);
  assert.equal(problemDescription(source.replaceAll('\n', '\r\n')), description);
  assert.equal(problemDescription(`## 题目描述\n\n${description}`), description);
  assert.equal(problemDescription('## 题目描述\n内容\n# 后续大标题\n不应复制'), '内容');
});

test('description headings accept Markdown variants without mistaking fenced code for headings', () => {
  for (const heading of [
    '## **题目描述**',
    '## 问题描述',
    '## 【题目描述】',
    '## Description',
    '## Problem Description',
    '题目描述\n---',
  ])
    assert.equal(
      problemDescription(`前言\n\n${heading}\n\n描述内容\n\n## 输入格式\n不应复制`),
      '描述内容',
    );
  for (const source of [
    '只有输入格式，没有描述章节。',
    '```md\n## 题目描述\n```',
    '## 题目描述\n\n## 输入格式\n输入内容',
    '',
  ])
    assert.equal(problemDescription(source), undefined);
});
