import { browser } from 'wxt/browser';
import type { Scope } from '../../core/scope';
import { requestSettings } from '../../platform/settings-client';
import { watchSettings } from '../../platform/settings-repository';
import {
  type ModuleEntry,
  type ModuleGroup,
  type ModuleId,
  moduleCatalog,
} from '../../shared/catalog';
import { isColorMode } from '../../shared/color-mode';
import { accentPresets, defaultAccentColor } from '../../shared/palette';
import type { SettingsCommand } from '../../shared/protocol';
import type { Settings } from '../../shared/settings';
import { mountAvatarSettings } from './avatars';
import { mountBackgroundSettings } from './background';
import { mountCommunitySettings } from './community';
import { mountUpdaterSettings } from './updater';
import { mountUserNamePalette } from './user-name-palette';
import { mountUserNameSources } from './user-name-sources';

export function mountSettings(root: ParentNode, scope: Scope): void {
  function element<T extends HTMLElement>(id: string): T {
    const node = root.querySelector(`#${id}`);
    if (!node) throw new Error(`Missing element: ${id}`);
    return node as T;
  }

  const controls = element<HTMLFieldSetElement>('controls');
  const enabled = element<HTMLInputElement>('enabled');
  const list = element<HTMLDivElement>('modules');
  const status = element<HTMLParagraphElement>('status');
  const retry = element<HTMLButtonElement>('retry');
  const palette = element<HTMLFieldSetElement>('palette');
  const accentColor = element<HTMLInputElement>('accent-color');
  const colorMode = element<HTMLFieldSetElement>('color-mode');
  const modeInputs = Array.from(colorMode.querySelectorAll<HTMLInputElement>('input'));
  const presetInputs: HTMLInputElement[] = [];
  const inputs = new Map<ModuleId, HTMLInputElement>();
  const helperInputs = new Map<ModuleId, HTMLInputElement>();
  let current: Settings | undefined;
  let pending = false;
  let pendingSaves = 0;
  let errorMessage = '';
  let storageChanges = 0;
  mountUpdaterSettings(root, scope);
  mountCommunitySettings(root, scope);
  const background = mountBackgroundSettings(root, scope, save);
  const commitUserNames = async (command: SettingsCommand) => {
    if (scope.signal.aborted || !current) throw new Error('设置尚未就绪');
    const settings = await requestSettings(command);
    if (!current || settings.revision >= current.revision) current = settings;
    render();
    return current;
  };
  const nameSources = mountUserNameSources(root, scope, commitUserNames);
  const namePalette = mountUserNamePalette(root, scope, commitUserNames);
  let avatarControls: ReturnType<typeof mountAvatarSettings> | undefined;

  element('version').textContent = `v${browser.runtime.getManifest().version}-f`;
  element<HTMLFormElement>('settings-form').addEventListener(
    'submit',
    (event) => event.preventDefault(),
    { signal: scope.signal },
  );

  // Submodules live as switches inside the 辅助功能 card, grouped in catalog order.
  function createHelperGroups(): HTMLElement {
    const groups = new Map<ModuleGroup, ModuleEntry[]>();
    for (const entry of moduleCatalog) {
      if (entry.group === null) continue;
      const entries = groups.get(entry.group);
      if (entries) entries.push(entry);
      else groups.set(entry.group, [entry]);
    }
    const container = document.createElement('div');
    container.className = 'helper-groups';
    for (const [groupName, entries] of groups) {
      const group = document.createElement('div');
      group.className = 'helper-group';
      const heading = document.createElement('h3');
      heading.className = 'helper-group-title';
      heading.textContent = groupName;
      const items = document.createElement('div');
      items.className = 'helper-items';
      for (const entry of entries) {
        const row = document.createElement('label');
        row.className = 'helper-row';
        const name = document.createElement('span');
        name.className = 'helper-name';
        name.textContent = entry.title;
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', 'false');
        toggle.dataset.moduleId = entry.id;
        if (entry.description) {
          row.title = entry.description;
          toggle.setAttribute('aria-description', entry.description);
        }
        toggle.addEventListener(
          'change',
          () => {
            void save({ type: 'settings.module', moduleId: entry.id, enabled: toggle.checked });
          },
          { signal: scope.signal },
        );
        row.append(name, toggle);
        items.append(row);
        helperInputs.set(entry.id, toggle);
      }
      group.append(heading, items);
      container.append(group);
    }
    return container;
  }

  for (const module of moduleCatalog) {
    if (module.group !== null) continue;
    const label = document.createElement('label');
    label.className = 'module row settings-card';
    label.dataset.moduleId = module.id;
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = module.title;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-checked', 'false');
    input.addEventListener(
      'change',
      () => {
        void save({ type: 'settings.module', moduleId: module.id, enabled: input.checked });
      },
      { signal: scope.signal },
    );
    text.append(title);
    if (module.description) {
      label.title = module.description;
      input.setAttribute('aria-description', module.description);
    }
    label.append(text, input);
    if (module.id === 'ui-helpers' || module.id === 'local-avatars') {
      const card = document.createElement('div');
      card.className = 'module settings-card';
      card.dataset.moduleId = module.id;
      label.className = 'row';
      card.append(label);
      if (module.id === 'local-avatars') avatarControls = mountAvatarSettings(card, scope, save);
      else card.append(createHelperGroups());
      list.append(card);
    } else list.append(label);
    if (module.id === 'ui-theme') {
      const pair = document.createElement('div');
      pair.className = 'appearance-pair';
      pair.append(palette, element('background'));
      list.append(colorMode, pair);
    }
    inputs.set(module.id, input);
  }

  for (const preset of accentPresets) {
    const label = document.createElement('label');
    label.className = 'swatch';
    label.style.setProperty('--swatch', preset.color);
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'accent-preset';
    input.value = preset.color;
    input.setAttribute('aria-label', preset.name);
    const name = document.createElement('span');
    name.textContent = preset.name;
    input.addEventListener(
      'change',
      () => {
        void save({ type: 'settings.accent', color: preset.color });
      },
      { signal: scope.signal },
    );
    label.append(input, name);
    element('accent-presets').insertBefore(label, accentColor.parentElement);
    presetInputs.push(input);
  }

  for (const input of modeInputs) {
    input.addEventListener(
      'change',
      () => {
        if (isColorMode(input.value)) void save({ type: 'settings.color-mode', mode: input.value });
      },
      { signal: scope.signal },
    );
  }

  function updateSwatches(color: string): void {
    accentColor.title = color.toUpperCase();
    accentColor.parentElement?.style.setProperty('--swatch', color);
    for (const input of presetInputs) input.checked = input.value === color;
    accentColor.parentElement?.classList.toggle(
      'is-custom',
      !presetInputs.some((input) => input.checked),
    );
  }

  accentColor.addEventListener('input', () => updateSwatches(accentColor.value), {
    signal: scope.signal,
  });
  accentColor.addEventListener(
    'change',
    () => {
      void save({ type: 'settings.accent', color: accentColor.value });
    },
    { signal: scope.signal },
  );

  function render(): void {
    if (scope.signal.aborted) return;
    background.render(current);
    nameSources.render(current);
    namePalette.render(current);
    avatarControls?.render(current);
    controls.disabled = pending || !current;
    enabled.checked = current?.enabled ?? false;
    enabled.setAttribute('aria-checked', String(enabled.checked));
    for (const [id, input] of inputs) {
      input.checked = current?.modules[id] ?? false;
      input.setAttribute('aria-checked', String(input.checked));
      input.disabled = !current?.enabled;
    }
    for (const [id, input] of helperInputs) {
      input.checked = current?.modules[id] ?? false;
      input.setAttribute('aria-checked', String(input.checked));
      input.disabled = !current?.enabled || !current.modules['ui-helpers'];
    }
    palette.disabled = !current?.enabled || !current.modules['ui-theme'];
    for (const input of modeInputs) input.checked = input.value === (current?.colorMode ?? 'light');
    accentColor.value = current?.accentColor ?? defaultAccentColor;
    updateSwatches(accentColor.value);
    status.textContent = errorMessage || (current ? '' : '正在读取设置…');
    status.hidden = !status.textContent;
    status.classList.toggle('error', Boolean(errorMessage));
    retry.hidden = !errorMessage;
    retry.disabled = pending || pendingSaves > 0;
  }

  function reportError(error: unknown): void {
    errorMessage = error instanceof Error ? error.message : '无法读取设置，请重新加载扩展。';
    render();
  }

  async function load(): Promise<void> {
    if (scope.signal.aborted) return;
    pending = true;
    errorMessage = '';
    render();
    const initialChanges = storageChanges;
    try {
      const settings = await requestSettings({ type: 'settings.read' });
      if (storageChanges === initialChanges) current = settings;
    } catch (error) {
      reportError(error);
    } finally {
      pending = false;
      render();
    }
  }

  async function save(command: SettingsCommand): Promise<void> {
    if (scope.signal.aborted || !current) return;
    pendingSaves++;
    errorMessage = '';
    try {
      const settings = await requestSettings(command);
      if (!current || settings.revision >= current.revision) current = settings;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : '保存失败，请重试。';
    } finally {
      pendingSaves--;
      if (pendingSaves === 0) render();
    }
  }

  const unwatch = watchSettings(
    (settings) => {
      storageChanges++;
      current = settings;
      if (pendingSaves === 0) {
        errorMessage = '';
        render();
      }
    },
    (error) => {
      storageChanges++;
      current = undefined;
      reportError(error);
    },
  );
  scope.defer(unwatch);
  enabled.addEventListener(
    'change',
    () => void save({ type: 'settings.enabled', enabled: enabled.checked }),
    { signal: scope.signal },
  );
  retry.addEventListener('click', () => void load(), { signal: scope.signal });
  void load();
}
