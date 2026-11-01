// Component coverage sentinel.
//
// The extension injects one override stylesheet that restyles Semantic UI components site-wide
// instead of patching individual pages, so it is easy to style a component on one page and forget
// the pages that render it later. This script logs in to the live site, walks a fixed set of
// routes, collects the class tokens that accompany "ui" on each element, and reports components
// that the stylesheet does not cover yet.
//
// Token counts are page counts: a component that appears ten times on one page counts once.
//
// Usage:
//   node build/audit-site-classes.mjs           Exit 0 when covered, 1 when something is uncovered,
//                                               2 when the crawl itself failed.
//   node build/audit-site-classes.mjs --soft    Same report, always exit 0.
//
// Chrome must be installed. Playwright's downloaded browsers are not, so set CHROME_PATH to the
// Chrome executable (the task runner relies on this) or make browsers available in node_modules.
// Credentials are read from .tmp/oj-credentials.json ({ origin, username, password }) and are
// never written back or logged.

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CREDENTIALS_PATH = resolve(REPOSITORY_ROOT, '.tmp/oj-credentials.json');
const PROFILE_PATH = resolve(REPOSITORY_ROOT, '.tmp/audit-site-classes');
const COVERED_COMPONENTS_PATH = resolve(REPOSITORY_ROOT, 'src/site/covered-components.json');
const SETTLE_MILLISECONDS = 600;
const LOGIN_SELECTORS = { username: '#username', password: '#password', submit: 'div#login' };

// Routes are appended to the origin from the credentials file. Paths are pathname plus search
// string; the numeric ids are real records that exist on that site, so every route resolves to a
// populated page instead of an empty state. Keep the ids alive when extending this list.
const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'problems-exercises', path: '/problems/exercises' },
  { name: 'problem', path: '/problem/70809' },
  { name: 'problem-suggestion', path: '/problem/70809/suggestion' },
  { name: 'problem-answers', path: '/problem/70809/answers' },
  { name: 'problem-statistics', path: '/problem/70809/statistics' },
  { name: 'submissions', path: '/submissions' },
  { name: 'submissions-by-user', path: '/submissions?submitter=for_fo_f' },
  { name: 'submission', path: '/submission/1059089' },
  { name: 'ranklist', path: '/ranklist?default=1' },
  { name: 'contests', path: '/contests' },
  { name: 'contest', path: '/contest/24180' },
  { name: 'user', path: '/user/991' },
  { name: 'user-edit', path: '/user/991/edit' },
  { name: 'user-squats', path: '/user/991/squats' },
  { name: 'user-friend', path: '/user/991/friend' },
  { name: 'user-login-tokens', path: '/user/login_tokens' },
  { name: 'user-requests', path: '/user_requests' },
  { name: 'prints-html', path: '/prints/html' },
  { name: 'sign-list', path: '/sign_list' },
  { name: 'suggestions-html', path: '/suggestions/html' },
  { name: 'help', path: '/help' },
  { name: 'progress-quiz', path: '/progress/quiz' },
  { name: 'progress-contests', path: '/progress/contests' },
  { name: 'progress-contest-table', path: '/progress/contest_table/html' },
  { name: 'user-tag-map', path: '/user_tag_map' },
  { name: 'rpgain', path: '/rpgain' },
  { name: 'vjudge-accounts', path: '/vjudge/accounts' },
  { name: 'chat', path: '/chat' },
  { name: 'foreign-list', path: '/foreign/list/html' },
  { name: 'user-plans', path: '/user_plans/991' },
  { name: 'login', path: '/login' },
];

// Tokens that are state, size, color, alignment, layout, animation, or transition modifiers rather
// than components, plus site-specific hook and utility classes that sit next to Semantic UI
// classes. Component tokens (table, button, menu, segment, dimmer, loader, list, search, tab, ...)
// are deliberately absent: excluding them would hide the gaps this sentinel exists to find.
// Semantic UI icon glyph names are not listed here; they are filtered separately because they are
// unbounded.
const EXCLUDED_TOKENS = new Set([
  'active',
  'aligned',
  'animating',
  'announce',
  'approve',
  'asterveil-has-wide-table',
  'asterveil-wide-padding',
  'asterveil-wide-table',
  'attached',
  'basic',
  'below',
  'black',
  'block',
  'blue',
  'bordered',
  'borderless',
  'bottom',
  'brown',
  'cancel',
  'celled',
  'center',
  'chat-error',
  'check-need-modal',
  'checkbox_privilege',
  'circular',
  'clearing',
  'collapsing',
  'column',
  'compact',
  'content',
  'copy',
  'daily-report',
  'data',
  'definition',
  'delete-account',
  'disabled',
  'divided',
  'doubling',
  'error',
  'existing',
  'fade',
  'field',
  'fields',
  'filled',
  'fixed',
  'floated',
  'fluid',
  'font-content',
  'green',
  'grey',
  'hidden',
  'horizontal',
  'huge',
  'in',
  'indicating',
  'info',
  'inline',
  'inverted',
  'item',
  'itemized',
  'items',
  'labeled',
  'large',
  'left',
  'loading',
  'login',
  'main',
  'markdown-edit',
  'massive',
  'medium',
  'middle',
  'mini',
  'modals',
  'negative',
  'notice_modal',
  'ok',
  'olive',
  'orange',
  'overlay',
  'padded',
  'page',
  'pink',
  'placeholder',
  'plan',
  'pointing',
  'positive',
  'primary',
  'purple',
  'radio',
  'red',
  'relaxed',
  'right',
  'rounded',
  'row',
  'scale',
  'scrolling',
  'secondary',
  'selectable',
  'selected',
  'selection',
  'sign_check',
  'sign_noticed',
  'simple',
  'slider',
  'small',
  'stackable',
  'sticky',
  'striped',
  'structured',
  'styled',
  'submit',
  'success',
  'tabular',
  'teal',
  'test-account',
  'text',
  'three',
  'tiny',
  'toggle',
  'toilet',
  'tooltip',
  'top',
  'transition',
  'type',
  'uncover',
  'uneval',
  'unstackable',
  'vertical',
  'very',
  'violet',
  'visible',
  'warning',
  'white',
  'wide',
  'yellow',
]);

const ICON_TOKEN = 'icon';
const UI_TOKEN = 'ui';

const loadCredentials = async () => {
  let text;
  try {
    text = await readFile(CREDENTIALS_PATH, 'utf8');
  } catch {
    throw new Error(
      `Missing credentials file: ${CREDENTIALS_PATH}. Expected {"origin","username","password"}.`,
    );
  }
  let value;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`Invalid JSON in ${CREDENTIALS_PATH}.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Credentials in ${CREDENTIALS_PATH} must be an object.`);
  }
  const { origin, username, password } = value;
  if (typeof origin !== 'string' || !/^https?:\/\//.test(origin)) {
    throw new Error(`Credentials field "origin" must be an absolute HTTP(S) URL.`);
  }
  if (typeof username !== 'string' || !username) {
    throw new Error(`Credentials field "username" must be a non-empty string.`);
  }
  if (typeof password !== 'string' || !password) {
    throw new Error(`Credentials field "password" must be a non-empty string.`);
  }
  return { origin: origin.replace(/\/+$/, ''), username, password };
};

const loadCoveredComponents = async () => {
  let value;
  try {
    value = JSON.parse(await readFile(COVERED_COMPONENTS_PATH, 'utf8'));
  } catch {
    throw new Error(`Could not read component list from ${COVERED_COMPONENTS_PATH}.`);
  }
  if (!value || !Array.isArray(value.components)) {
    throw new Error(`${COVERED_COMPONENTS_PATH} must contain a "components" array.`);
  }
  const components = [];
  for (const entry of value.components) {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`${COVERED_COMPONENTS_PATH} contains a non-string component token.`);
    }
    if (entry.includes(UI_TOKEN)) {
      throw new Error(`Component token "${entry}" must omit the leading "ui" class.`);
    }
    components.push(entry.trim());
  }
  const reviewed = {};
  if (value.reviewed !== undefined) {
    if (!value.reviewed || typeof value.reviewed !== 'object' || Array.isArray(value.reviewed)) {
      throw new Error(`${COVERED_COMPONENTS_PATH} "reviewed" must be an object of reasons.`);
    }
    for (const [token, reason] of Object.entries(value.reviewed)) {
      if (typeof reason !== 'string' || !reason.trim()) {
        throw new Error(`${COVERED_COMPONENTS_PATH} needs a reason for reviewed "${token}".`);
      }
      if (components.includes(token)) {
        throw new Error(`"${token}" cannot be both covered and reviewed.`);
      }
      reviewed[token] = reason.trim();
    }
  }
  return { components: [...new Set(components)], reviewed };
};

const openChrome = async () => {
  await mkdir(PROFILE_PATH, { recursive: true });
  try {
    return await chromium.launchPersistentContext(PROFILE_PATH, {
      executablePath: process.env.CHROME_PATH || chromium.executablePath(),
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--ignore-certificate-errors'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(
      `Could not launch Chrome (${detail}). Set CHROME_PATH to the Chrome executable.`,
    );
  }
};

// The persistent profile keeps the login cookie, so a second run reuses the signed-in session and
// must not submit the login form again: the site answers /login with an error page while signed in.
const hasSession = async (page, origin) => {
  try {
    await page.goto(new URL('/', origin).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MILLISECONDS);
    return await page.evaluate(() => Boolean(document.querySelector('#user-dropdown')));
  } catch {
    return false;
  }
};

const login = async (page, { origin, username, password }) => {
  try {
    await page.goto(new URL('/login', origin).href, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForSelector(LOGIN_SELECTORS.username, { timeout: 15_000 });
  } catch {
    throw new Error('Login failed: the login page did not render the #username field.');
  }
  await page.fill(LOGIN_SELECTORS.username, username);
  await page.fill(LOGIN_SELECTORS.password, password);
  await Promise.all([
    page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
      .catch(() => {}),
    page.click(LOGIN_SELECTORS.submit),
  ]);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const loggedIn = await page.evaluate(
    () => location.pathname === '/' || Boolean(document.querySelector('#user-dropdown')),
  );
  if (!loggedIn) {
    throw new Error('Login failed: the page did not reach / and no #user-dropdown appeared.');
  }
};

// Collects class tokens from every element whose class attribute carries "ui" as a standalone
// token. Tokens that also occur on elements without the icon class are tracked separately so icon
// glyph names (for example "ui birthday cake icon") can be discarded without a fixed name list.
const collectPageTokens = (page) =>
  page.evaluate(
    ({ iconToken, uiToken }) => {
      const tokens = new Set();
      const nonIconTokens = new Set();
      for (const element of document.querySelectorAll('[class]')) {
        const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
        if (!classes.includes(uiToken)) continue;
        const hasIcon = classes.includes(iconToken);
        for (const token of classes) {
          if (token === uiToken) continue;
          tokens.add(token);
          if (!hasIcon) nonIconTokens.add(token);
        }
      }
      return { tokens: [...tokens], nonIconTokens: [...nonIconTokens] };
    },
    { iconToken: ICON_TOKEN, uiToken: UI_TOKEN },
  );

const crawl = async (page, origin) => {
  const visits = [];
  const failures = [];
  for (const route of ROUTES) {
    let status = 0;
    try {
      const response = await page.goto(new URL(route.path, origin).href, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      status = response?.status() ?? 0;
      await page.waitForTimeout(SETTLE_MILLISECONDS);
      const finalPath = new URL(page.url()).pathname;
      if (finalPath === '/login' && route.path !== '/login') {
        failures.push({ route, reason: 'redirected to /login' });
        continue;
      }
      if (status >= 400) {
        failures.push({ route, reason: `HTTP ${status}` });
        continue;
      }
      const title = await page.title();
      const bodyText = await page.evaluate(() => (document.body?.innerText ?? '').trim());
      if (/error|错误/i.test(title) || /^(?:error|错误)$/i.test(bodyText)) {
        failures.push({ route, reason: `error page (HTTP ${status}, title "${title}")` });
        continue;
      }
      const collected = await collectPageTokens(page);
      visits.push({ route, tokens: collected.tokens, nonIconTokens: collected.nonIconTokens });
    } catch (error) {
      const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
      failures.push({ route, reason: detail });
    }
  }
  return { visits, failures };
};

const buildReport = (covered, reviewed, visits, failures, origin) => {
  const observedTokens = new Set();
  const nonIconTokens = new Set();
  for (const visit of visits) {
    for (const token of visit.tokens) observedTokens.add(token);
    for (const token of visit.nonIconTokens) nonIconTokens.add(token);
  }
  const iconGlyphTokens = new Set(
    [...observedTokens].filter((token) => token !== ICON_TOKEN && !nonIconTokens.has(token)),
  );
  const candidateTokens = new Set(
    [...observedTokens].filter(
      (token) => token !== ICON_TOKEN && !iconGlyphTokens.has(token) && !EXCLUDED_TOKENS.has(token),
    ),
  );

  const pageCounts = new Map();
  const examples = new Map();
  for (const visit of visits) {
    const seen = new Set();
    for (const token of visit.tokens) {
      if (!candidateTokens.has(token) || seen.has(token)) continue;
      seen.add(token);
      pageCounts.set(token, (pageCounts.get(token) ?? 0) + 1);
      const list = examples.get(token) ?? [];
      if (list.length < 2) list.push(visit.route.path);
      examples.set(token, list);
    }
  }

  const coveredSet = new Set(covered);
  const observed = (token) => pageCounts.get(token) ?? 0;
  const reviewedTokens = Object.keys(reviewed);
  const uncovered = [...candidateTokens]
    .filter((token) => !coveredSet.has(token) && !reviewed[token])
    .map((token) => ({ token, pages: observed(token), examples: examples.get(token) ?? [] }))
    .sort((a, b) => b.pages - a.pages || a.token.localeCompare(b.token));

  const pages = [];
  pages.push('Component coverage sentinel');
  pages.push(`Origin: ${origin}`);
  pages.push(`Pages visited: ${visits.length}/${ROUTES.length}`);
  if (failures.length) {
    pages.push(`Failed routes: ${failures.length}`);
    for (const failure of failures) {
      pages.push(`  ${failure.route.path.padEnd(32)} ${failure.reason}`);
    }
  } else {
    pages.push('Failed routes: none');
  }
  pages.push('');
  pages.push(`Covered components (${covered.length}):`);
  for (const token of covered) {
    pages.push(`  ${token.padEnd(20)} ${observed(token)} page(s)`);
  }
  pages.push('');
  if (reviewedTokens.length) {
    pages.push(`Reviewed components (${reviewedTokens.length}) — site rendering kept:`);
    for (const token of reviewedTokens.sort()) {
      pages.push(`  ${token.padEnd(20)} ${observed(token)} page(s)  ${reviewed[token]}`);
    }
    pages.push('');
  }
  if (uncovered.length) {
    pages.push(`UNCOVERED components (${uncovered.length}), most widespread first:`);
    for (const entry of uncovered) {
      pages.push(
        `  ${entry.token.padEnd(20)} ${entry.pages} page(s)  e.g. ${entry.examples.join(', ')}`,
      );
    }
  } else {
    pages.push('UNCOVERED components: none. Every observed component is covered.');
  }
  return { lines: pages, uncovered, visits };
};

const main = async () => {
  const soft = process.argv.includes('--soft');
  let context;
  let exitCode = 0;
  try {
    const credentials = await loadCredentials();
    const { components: covered, reviewed } = await loadCoveredComponents();
    context = await openChrome();
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    if (await hasSession(page, credentials.origin)) {
      console.log(`Reusing the signed-in session in ${PROFILE_PATH}.`);
    } else {
      await login(page, credentials);
    }
    const { visits, failures } = await crawl(page, credentials.origin);
    const report = buildReport(covered, reviewed, visits, failures, credentials.origin);
    console.log(report.lines.join('\n'));
    if (visits.length < ROUTES.length / 2) {
      console.error(
        `\nCrawl failed: only ${visits.length} of ${ROUTES.length} routes loaded. ` +
          'Check connectivity, credentials, and whether the site is reachable.',
      );
      exitCode = 2;
    } else {
      exitCode = report.uncovered.length ? 1 : 0;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exitCode = 2;
  } finally {
    await context?.close().catch(() => {});
  }
  process.exit(soft ? 0 : exitCode);
};

await main();
