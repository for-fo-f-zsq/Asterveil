import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'marked';
import { chromium } from 'playwright';

const out = resolve('.tmp/problem-copy-browser');
await mkdir(out, { recursive: true });
const description =
  '计算 $a+b$。\n\n```markdown\n## 输入格式\n这仍然属于代码。\n```\n\n### 说明\n\n保留公式与代码。';
const source = `# 示例题目\n\n题目背景\n\n## 题目描述\n\n${description}\n\n## 输入格式\n两个整数。\n\n## 输出格式\n一个整数。`;
const escapeMarkup = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const sourceButton = '[data-asterveil="copy-problem-source"]';
const descriptionButton = '[data-asterveil="copy-problem-description"]';
const origin = 'https://jx.7fa4.cn:8888';
function fixture(path) {
  const sourcePath = path.startsWith('/contest/')
    ? `${path}/markdown/html`
    : '/problem/1/markdown/html';
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
    body{margin:0;font:15px system-ui;background:#f8f9fc}
    .ui.main.container{margin:40px auto;width:90%;max-width:1100px}
    .ui.buttons{display:inline-flex;flex-wrap:wrap;border-radius:8px}
    .ui.button{display:inline-block;padding:10px 16px;border:0;border-radius:4px;background:#ececf2;color:#343444;font:inherit;text-decoration:none;cursor:pointer}
    .ui.buttons>.ui.button{border-radius:0}
    .ui.buttons>.ui.button:first-child{border-top-left-radius:8px;border-bottom-left-radius:8px}
    .ui.buttons>.ui.button:last-child{border-top-right-radius:8px;border-bottom-right-radius:8px}
    .font-content{padding:20px;background:white}pre{white-space:pre-wrap}
    </style></head><body><main class="ui main container"><div class="ui grid"><div class="row"><div class="column"><h1>P1. 示例题目</h1><p>时间限制：1000 ms</p><div class="ui buttons"><a id="native-source" class="small ui button" href="${sourcePath}">题面源码</a><a class="small ui button" href="#submit_code">提交</a><a class="small ui button" href="/problem/1/statistics">统计</a></div><div class="ui bottom attached segment font-content"><div>${parse(source)}</div></div></div></div></div></main></body></html>`;
}

for (const product of ['Asterveil', 'Asterveil Pro']) {
  const context = await chromium.launchPersistentContext(await mkdtemp(`${out}/profile-`), {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
    args: ['--enable-unsafe-extension-debugging'],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  context.setDefaultTimeout(12_000);
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: resolve('.output', product) });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(() =>
      chrome.storage.local.set({
        'asterveil:settings': {
          schemaVersion: 1,
          revision: 0,
          enabled: true,
          colorMode: 'light',
          modules: { homework: false, 'user-names': false, 'local-avatars': false },
        },
      }),
    );
    let markdown = source;
    const errors = [];
    await context.route(/^https:\/\/(?:jx|in)\.7fa4\.cn:8888\//, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/markdown/html')) {
        return route
          .fulfill({
            contentType: 'text/html; charset=utf-8',
            body: `<html><body><pre>${escapeMarkup(markdown)}</pre></body></html>`,
          })
          .catch(() => undefined);
      }
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture(path) });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const settings = async (tab = page) => {
      await tab.getByRole('button', { name: `打开 ${product} 设置`, exact: true }).click();
      await tab.getByRole('button', { name: '功能模块', exact: true }).click();
      await tab.locator('.module[data-module-id="ui-helpers"]').waitFor();
    };
    const card = page.locator('.module[data-module-id="ui-helpers"]');
    // Capture clipboard writes in this extension's isolated world, leaving the OS clipboard intact.
    async function clipboard(tab, initialize = false) {
      return worker.evaluate(
        async ({ url, initialize }) => {
          const [target] = await chrome.tabs.query({ url });
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: target.id },
            func: (initialize) => {
              if (initialize) {
                window.copyFixture = [];
                navigator.clipboard.writeText = async (text) => {
                  window.copyFixture.push(text);
                };
              }
              return window.copyFixture;
            },
            args: [initialize],
          });
          return result.result;
        },
        { url: tab.url(), initialize },
      );
    }
    async function copy(tab, selector, expected) {
      await tab.locator(selector).click();
      await tab.waitForFunction(
        (selector) => document.querySelector(selector)?.textContent === '已复制',
        selector,
      );
      assert.equal((await clipboard(tab)).at(-1), expected);
    }
    await page.goto(`${origin}/problem/1`);
    await page.locator(descriptionButton).waitFor();
    assert.equal(await page.locator(sourceButton).count(), 1);
    assert.equal(await page.locator('#native-source').isVisible(), true);
    await clipboard(page, true);
    await copy(page, sourceButton, source);
    await copy(page, descriptionButton, description);
    await settings();
    assert.equal(await card.locator('[data-problem-copy]').count(), 0);
    await card.screenshot({ path: resolve(out, `${product}-helpers.png`) });
    await card.getByRole('switch', { name: '辅助功能', exact: true }).uncheck();
    await page.waitForFunction((selector) => !document.querySelector(selector), sourceButton);
    assert.equal(await page.locator('#native-source').isVisible(), true);
    await card.getByRole('switch', { name: '辅助功能', exact: true }).check();
    await page.locator(descriptionButton).waitFor();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await copy(page, descriptionButton, description);
    await worker.evaluate(async () => {
      const key = 'asterveil:settings';
      const current = (await chrome.storage.local.get(key))[key];
      await chrome.storage.local.set({
        [key]: {
          ...current,
          revision: current.revision + 1,
          modules: { ...current.modules, 'ui-theme': false },
        },
      });
    });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute('data-asterveil-appearance'),
    );
    await copy(page, sourceButton, source);
    markdown = '## 输入格式\n这不是题目描述。';
    const copies = (await clipboard(page)).length;
    await page.locator(descriptionButton).click();
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent === '未找到题目描述',
      descriptionButton,
    );
    assert.equal((await clipboard(page)).length, copies);
    markdown = source;
    const second = await context.newPage();
    await second.goto('https://in.7fa4.cn:8888/contest/9/problem/1');
    await second.locator(descriptionButton).waitFor();
    assert.equal(await second.locator('#native-source').isVisible(), true);
    await clipboard(second, true);
    await copy(second, descriptionButton, description);
    await second.close();
    await page.goto(`${origin}/problem/1/answers`);
    await settings();
    assert.equal(await page.locator(descriptionButton).count(), 0);
    assert.equal(await page.locator('#native-source').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log(
      `${product}: merged helper copy buttons, helper switch, theme independence and page scoping passed.`,
    );
  } finally {
    await context.close();
  }
}
