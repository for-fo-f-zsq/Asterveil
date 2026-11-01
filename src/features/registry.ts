import type { ModuleDefinition } from '../core/module';
import { type AppearancePage, appearancePage } from '../site/appearance';
import { matchesHomeworkPage } from '../site/homework';

function matchesPages(...pages: readonly AppearancePage[]) {
  return (url: URL): boolean => {
    const page = appearancePage(url);
    return page !== undefined && pages.includes(page);
  };
}

export const modules = [
  {
    id: 'homework',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules.homework,
    matches: matchesHomeworkPage,
    load: () => import('./homework').then((module) => module.default),
  },
  {
    id: 'copy-problem',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules['copy-problem'],
    matches: matchesPages('problem'),
    load: () => import('./copy-problem').then((module) => module.default),
  },
  {
    id: 'submission-code',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules['submission-code'],
    matches: matchesPages('submission'),
    load: () => import('./submission-code').then((module) => module.default),
  },
  {
    id: 'ranking-filters',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules['ranking-filters'],
    matches: matchesPages('account-rankings'),
    load: () => import('./ranking-filters').then((module) => module.default),
  },
  {
    id: 'contest-review',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules['contest-review'],
    matches: matchesPages('contest'),
    load: () => import('./contest-review').then((module) => module.default),
  },
  {
    id: 'page-tidy',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules['page-tidy'],
    matches: matchesPages(
      'login',
      'account-vjudge',
      'account',
      'account-rankings',
      'account-data',
      'account-schedule',
      'plans',
    ),
    load: () => import('./page-tidy').then((module) => module.default),
  },
  {
    id: 'tips',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules.tips,
    matches: matchesPages('problem'),
    load: () => import('./tips').then((module) => module.default),
  },
  {
    id: 'chat-markdown',
    enabled: (settings) => settings.modules['ui-helpers'] && settings.modules['chat-markdown'],
    matches: matchesPages('chat'),
    load: () => import('./chat-markdown').then((module) => module.default),
  },
  {
    id: 'user-names',
    configurationKey: (settings) => String(settings.userNames.revision),
    matches: () => true,
    load: () => import('./user-names').then((module) => module.default),
  },
  {
    id: 'local-avatars',
    configurationKey: (settings) => settings.avatarStyle,
    matches: () => true,
    load: () => import('./local-avatars').then((module) => module.default),
  },
] satisfies readonly ModuleDefinition[];
