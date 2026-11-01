import { editorName, pdfEnabled } from './edition';

export type ModuleGroup = '编辑' | '复制' | '筛选与目录' | '页面整理' | '提示' | '聊天';

// Metadata is safe to import in the popup, worker, and content script.
// Entries with a group are switches inside the 辅助功能 card instead of their own row.
export const moduleCatalog = [
  {
    id: 'ui-helpers',
    title: '辅助功能',
    description: '为页面补充复制、筛选、目录和提示等便捷操作。',
    defaultEnabled: true,
    group: null,
  },
  {
    id: 'ui-theme',
    title: '界面美化',
    description: '统一导航、面板、表格和表单的配色、圆角与间距，并应用页面背景。',
    defaultEnabled: true,
    group: null,
  },
  {
    id: 'user-names',
    title: 'Better Names',
    description: '根据 Better Names 数据库显示姓名，悬停可查看原用户名。',
    defaultEnabled: true,
    group: null,
  },
  {
    id: 'local-avatars',
    title: '头像替换',
    description: '',
    defaultEnabled: true,
    group: null,
  },
  {
    id: 'homework',
    title: editorName,
    description: pdfEnabled
      ? '在线作答、导出图片和 PDF、提交 PDF，以及折叠已提交作业。'
      : '在线作答、导出和提交图片，以及折叠已提交作业。',
    defaultEnabled: true,
    group: '编辑',
  },
  {
    id: 'copy-problem',
    title: '复制题面与标题',
    description: '在题目页补充复制源码、复制题目描述，双击标题复制题号与标题。',
    defaultEnabled: true,
    group: '复制',
  },
  {
    id: 'submission-code',
    title: '复制提交代码',
    description: '在评测详情页一键复制完整代码。',
    defaultEnabled: true,
    group: '复制',
  },
  {
    id: 'ranking-filters',
    title: '榜单筛选',
    description: '按学校、集团校、时年和年级筛选榜单。',
    defaultEnabled: true,
    group: '筛选与目录',
  },
  {
    id: 'contest-review',
    title: '模测复盘入口',
    description: '在模测页补充写复盘表和看复盘表入口。',
    defaultEnabled: true,
    group: '筛选与目录',
  },
  {
    id: 'page-tidy',
    title: '登录与账号页',
    description: '整理登录、账号资料、计划和 VJudge 账号页的表格与表单。',
    defaultEnabled: true,
    group: '页面整理',
  },
  {
    id: 'tips',
    title: '操作提示',
    description: '为题目页的操作按钮补充延迟悬停提示。',
    defaultEnabled: true,
    group: '提示',
  },
  {
    id: 'chat-markdown',
    title: '聊天 Markdown',
    description: '在聊天页渲染 Markdown、公式和代码。',
    defaultEnabled: true,
    group: '聊天',
  },
] as const;

export type ModuleId = (typeof moduleCatalog)[number]['id'];

export type ModuleEntry = (typeof moduleCatalog)[number];

export function isModuleId(value: unknown): value is ModuleId {
  return moduleCatalog.some((module) => module.id === value);
}
