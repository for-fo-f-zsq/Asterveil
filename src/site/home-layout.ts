import type { Scope } from '../core/scope';
import {
  defaultHomeLayout,
  type HomeColumn,
  type HomeLayout,
  type HomeSectionId,
  homeSections,
  moveHomeSection,
} from '../shared/home-layout';
import type { SettingsCommand } from '../shared/protocol';
import type { Settings } from '../shared/settings';
import css from './home-layout.css?inline';

interface Block {
  id: HomeSectionId;
  heading: HTMLElement;
  body: HTMLElement;
  anchors: [Comment, Comment];
}

const icons = {
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="3.5" r="1.2"/><circle cx="10" cy="3.5" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12.5" r="1.2"/><circle cx="10" cy="12.5" r="1.2"/></svg>',
  eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.1"/></svg>',
  eyeOff:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.1"/><path d="M3 2.5 13 13.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  check:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3.2L13 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reset:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 8a5.8 5.8 0 0 1 10-4l1.6 1.5M13.8 8a5.8 5.8 0 0 1-10 4l-1.6-1.5M13.9 2.4v3.4h-3.4M2.1 13.6v-3.4h3.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function titleOf(id: HomeSectionId): string {
  return homeSections.find((section) => section.id === id)?.title ?? '';
}

// Move original nodes together, retaining their event listeners and live content.
export function createHomeLayout(
  scope: Scope,
  save: (command: SettingsCommand) => Promise<unknown>,
) {
  const blocks = new Map<HomeSectionId, Block>();
  const actions: HTMLElement[] = [];
  let current: HomeLayout | undefined;
  let container: HTMLElement | null = null;
  let grid: HTMLElement | null = null;
  let columns: HTMLElement[] = [];
  let bar: HTMLElement | undefined;
  let barScope: AbortController | undefined;
  let containerScope: AbortController | undefined;
  let frame = 0;
  let editing = false;
  let lastKey = '';
  let dragging: HomeSectionId | undefined;
  let dropTarget:
    | {
        column: HomeColumn;
        before: HomeSectionId | null;
        anchor?: { id: HomeSectionId; after: boolean } | undefined;
      }
    | undefined;
  let dropLine: HTMLElement | undefined;
  let dragX = 0;
  let dragY = 0;
  let scrollFrame = 0;
  let statusTimer: ReturnType<typeof setTimeout> | 0 = 0;
  const style = document.createElement('style');
  style.dataset.asterveil = 'home-layout';
  style.textContent = css;
  const empty = document.createElement('p');
  empty.className = 'asterveil-home-empty';
  empty.textContent = '所有首页板块已隐藏，可在首页左上角重新开启。';
  const observer = new MutationObserver((records) => {
    // Ignore clocks, table updates and other changes inside a block.
    if (
      records.some(
        ({ target }) =>
          target === container ||
          target === grid ||
          target === bar ||
          columns.includes(target as HTMLElement) ||
          (target instanceof HTMLElement && target.matches('.padding, .column')),
      )
    ) {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          apply();
        });
    }
  });

  function setStatus(message: string) {
    const status = bar?.querySelector<HTMLElement>('.asterveil-home-status');
    if (!status) return;
    status.textContent = message;
    if (statusTimer) clearTimeout(statusTimer);
    if (message)
      statusTimer = setTimeout(() => {
        statusTimer = 0;
        status.textContent = '';
      }, 4000);
  }

  function focusSection(id: HomeSectionId, target: 'grip' | 'eye') {
    const selector = target === 'grip' ? '.asterveil-home-grip' : '.asterveil-home-eye';
    blocks.get(id)?.heading.querySelector<HTMLElement>(selector)?.focus?.();
  }

  function placeBar() {
    if (!bar) return;
    const menu = document.querySelector<HTMLElement>('.ui.fixed.borderless.menu');
    const top = menu ? Math.max(0, menu.getBoundingClientRect().bottom) + 8 : 64;
    bar.style.top = `${Math.round(top)}px`;
  }

  function ensureBar() {
    if (!container) return;
    if (style.parentNode !== document.documentElement) document.documentElement.append(style);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'asterveil-home-editor';
      bar.dataset.asterveil = 'home-editor';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'asterveil-home-edit';
      edit.setAttribute('aria-label', '调整首页板块');
      edit.title = '调整首页板块';
      edit.innerHTML = icons.grid;
      actions.length = 0;
      const actionsRow = document.createElement('div');
      actionsRow.className = 'asterveil-home-actions';
      actionsRow.hidden = true;
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'asterveil-home-done';
      done.setAttribute('aria-label', '完成调整');
      done.title = '完成调整';
      done.innerHTML = icons.check;
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'asterveil-home-reset';
      reset.setAttribute('aria-label', '恢复默认布局');
      reset.title = '恢复默认布局';
      reset.innerHTML = icons.reset;
      actionsRow.append(done, reset);
      actions.push(actionsRow);
      const status = document.createElement('span');
      status.className = 'asterveil-home-status';
      status.setAttribute('role', 'status');
      bar.append(edit, actionsRow, status);
      barScope = new AbortController();
      const options = { signal: barScope.signal };
      window.addEventListener('resize', placeBar, options);
      bar.addEventListener(
        'click',
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest('.asterveil-home-edit')) setEditing(true);
          else if (target.closest('.asterveil-home-done')) setEditing(false);
          else if (target.closest('.asterveil-home-reset')) {
            const next = defaultHomeLayout();
            void commit(next, { type: 'settings.home.reset' });
          }
        },
        options,
      );
    }
    bar.classList.toggle('is-editing', editing);
    for (const row of actions) row.hidden = !editing;
    if (bar.parentNode !== document.body) document.body.append(bar);
    placeBar();
  }

  function removeBar() {
    barScope?.abort();
    barScope = undefined;
    bar?.remove();
    bar = undefined;
    actions.length = 0;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = 0;
    if (!grid) style.remove();
  }

  function detachContainer() {
    containerScope?.abort();
    containerScope = undefined;
  }

  function restore() {
    observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    for (const block of blocks.values()) {
      block.heading.querySelector(':scope > .asterveil-home-tool')?.remove();
      [block.heading, block.body].forEach((node, index) => {
        const anchor = block.anchors[index];
        node.removeAttribute('data-av-home-hidden');
        node.removeAttribute('data-av-home-section');
        node.removeAttribute('data-av-home-dragged');
        if (node.isConnected && anchor?.isConnected) anchor.replaceWith(node);
        else anchor?.remove();
      });
    }
    blocks.clear();
    for (const column of columns) {
      column.removeAttribute('data-av-home-empty');
      if (column.dataset.avHomeColumn) delete column.dataset.avHomeColumn;
    }
    grid?.removeAttribute('data-av-home-single');
    grid?.removeAttribute('data-av-home-layout');
    grid?.removeAttribute('data-av-home-editing');
    grid?.removeAttribute('data-av-home-dragging');
    columns = [];
    grid = null;
    if (!bar) style.remove();
    empty.remove();
    dragging = undefined;
    dropTarget = undefined;
    stopAutoScroll();
    hideDropLine();
  }

  function setEditing(value: boolean) {
    if (editing === value) return;
    editing = value;
    setStatus('');
    lastKey = '';
    ensureBar();
    const isDefault = !current || JSON.stringify(current) === JSON.stringify(defaultHomeLayout());
    if (editing) apply();
    else if (isDefault) restore();
    else apply();
  }

  function orderedIds(column: HomeColumn): HomeSectionId[] {
    return current?.filter((item) => item.column === column).map((item) => item.id) ?? [];
  }

  async function commit(next: HomeLayout, command: SettingsCommand) {
    if (!current || JSON.stringify(next) === JSON.stringify(current)) return;
    const previous = current;
    current = next;
    lastKey = '';
    apply();
    try {
      await save(command);
      setStatus('');
    } catch {
      current = previous;
      lastKey = '';
      apply();
      setStatus('保存失败，请重试。');
    }
  }

  function moveTo(id: HomeSectionId, column: HomeColumn, before: HomeSectionId | null) {
    if (!current) return;
    const next = moveHomeSection(current, id, column, before);
    if (next === current) return;
    void commit(next, { type: 'settings.home.move', id, column, before }).then(() => {
      focusSection(id, 'grip');
    });
  }

  function handleGripKey(event: KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const grip = target.closest('.asterveil-home-grip');
    if (!grip) return;
    const heading = grip.closest<HTMLElement>('[data-av-home-section]');
    const id = heading?.dataset.avHomeSection as HomeSectionId | undefined;
    if (!id || !current) return;
    const section = current.find((item) => item.id === id);
    if (!section) return;
    const ids = orderedIds(section.column);
    const index = ids.indexOf(section.id);
    if (index < 0) return;
    let handled = true;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= ids.length) return;
      const ordered = [...ids];
      ordered.splice(index, 1);
      ordered.splice(nextIndex, 0, section.id);
      moveTo(section.id, section.column, ordered[nextIndex + 1] ?? null);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const toSide =
        event.key === 'ArrowRight' ? section.column === 'main' : section.column === 'side';
      moveTo(section.id, toSide ? 'side' : 'main', null);
    } else if (event.key === 'Home') {
      if (index === 0) return;
      moveTo(section.id, section.column, ids[0] ?? null);
    } else if (event.key === 'End') {
      if (index === ids.length - 1) return;
      moveTo(section.id, section.column, null);
    } else handled = false;
    if (handled) event.preventDefault();
  }

  function toggleVisible(id: HomeSectionId) {
    const item = current?.find((section) => section.id === id);
    if (!item || !current) return;
    const visible = !item.visible;
    const next = current.map((section) => (section.id === id ? { ...section, visible } : section));
    void commit(next, { type: 'settings.home.visible', id, visible }).then(() => {
      focusSection(id, 'eye');
    });
  }

  function ensureDropLine() {
    if (!dropLine) {
      dropLine = document.createElement('div');
      dropLine.className = 'asterveil-home-drop';
      dropLine.hidden = true;
    }
    if (dropLine.parentNode !== document.body) document.body.append(dropLine);
    return dropLine;
  }

  function hideDropLine() {
    if (dropLine) dropLine.hidden = true;
  }

  function placeDropLine(anchor: { id: HomeSectionId; after: boolean } | undefined) {
    const line = ensureDropLine();
    let top = 0;
    let left = 0;
    let width = 0;
    if (anchor) {
      const block = blocks.get(anchor.id);
      if (!block) return;
      const rect = (anchor.after ? block.body : block.heading).getBoundingClientRect();
      top = anchor.after ? rect.bottom : rect.top;
      left = rect.left;
      width = rect.width;
    } else {
      const column = columns.find((node) => node.dataset.avHomeColumn === dropTarget?.column);
      if (!column) return;
      const rect = column.getBoundingClientRect();
      top = rect.top + 4;
      left = rect.left;
      width = rect.width;
    }
    line.style.left = `${Math.round(left)}px`;
    line.style.width = `${Math.round(width)}px`;
    line.style.top = `${Math.round(top)}px`;
    line.hidden = false;
  }

  function clearDropIndicator() {
    dropTarget = undefined;
    hideDropLine();
  }

  function stopAutoScroll() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }

  function autoScroll() {
    scrollFrame = 0;
    if (!dragging) return;
    // Keep the pointer's viewport edge zone generous so scrolling starts early.
    const edge = Math.min(380, Math.max(200, window.innerHeight * 0.42));
    const minSpeed = 8;
    const speed = 44;
    let delta = 0;
    if (dragY < edge) delta = -Math.ceil(minSpeed + ((edge - dragY) / edge) * (speed - minSpeed));
    else if (dragY > window.innerHeight - edge)
      delta = Math.ceil(
        minSpeed + ((dragY - (window.innerHeight - edge)) / edge) * (speed - minSpeed),
      );
    if (delta !== 0) {
      window.scrollBy(0, delta);
      updateDropAt(dragX, dragY);
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function clearDragging() {
    dragging = undefined;
    stopAutoScroll();
    grid?.removeAttribute('data-av-home-dragging');
    for (const node of document.querySelectorAll('[data-av-home-dragged]'))
      node.removeAttribute('data-av-home-dragged');
  }

  function clearIndicators() {
    clearDropIndicator();
    clearDragging();
  }

  function updateDropAt(clientX: number, clientY: number) {
    if (!dragging) return;
    const element = document.elementFromPoint(clientX, clientY);
    if (!(element instanceof Element)) {
      clearDropIndicator();
      return;
    }
    const column = columns.find((node) => node.contains(element));
    const name = column?.dataset.avHomeColumn as HomeColumn | undefined;
    if (!column || !name) {
      clearDropIndicator();
      return;
    }
    const blockElement = element.closest<HTMLElement>('[data-av-home-section]');
    const sectionId = blockElement?.dataset.avHomeSection as HomeSectionId | undefined;
    if (sectionId === dragging) {
      clearDropIndicator();
      return;
    }
    const ids = orderedIds(name).filter((id) => id !== dragging);
    if (sectionId) {
      const index = ids.indexOf(sectionId);
      const block = blocks.get(sectionId);
      if (index < 0 || !block) {
        clearDropIndicator();
        return;
      }
      const rect = block.heading.getBoundingClientRect();
      const after = clientY > rect.top + rect.height / 2;
      const anchor = { id: sectionId, after };
      dropTarget = { column: name, before: after ? (ids[index + 1] ?? null) : sectionId, anchor };
      placeDropLine(anchor);
      return;
    }
    const visible = ids
      .map((id) => blocks.get(id))
      .filter((block): block is Block => Boolean(block));
    const last = visible.length ? visible[visible.length - 1] : undefined;
    const anchor = last ? { id: last.id, after: true } : undefined;
    dropTarget = { column: name, before: null, anchor };
    placeDropLine(anchor);
  }

  function handleDragStart(event: DragEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const grip = target.closest('.asterveil-home-grip');
    const heading = grip?.closest<HTMLElement>('[data-av-home-section]');
    const id = heading?.dataset.avHomeSection as HomeSectionId | undefined;
    if (!id || !event.dataTransfer) return;
    dragging = id;
    dragX = event.clientX;
    dragY = event.clientY;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    grid?.setAttribute('data-av-home-dragging', '');
    heading?.setAttribute('data-av-home-dragged', '');
    ensureDropLine();
    if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
  }

  function handleDragOver(event: DragEvent) {
    if (!dragging) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!columns.some((node) => node.contains(target))) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dragX = event.clientX;
    dragY = event.clientY;
    updateDropAt(dragX, dragY);
  }

  function handleDrop(event: DragEvent) {
    if (!dragging) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!columns.some((node) => node.contains(target))) return;
    event.preventDefault();
    updateDropAt(event.clientX, event.clientY);
    if (!dropTarget) {
      clearIndicators();
      return;
    }
    const id = dragging;
    const { column: name, before } = dropTarget;
    clearIndicators();
    moveTo(id, name, before === id ? null : before);
  }

  function handleDragEnd() {
    clearIndicators();
  }

  function handleClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const eye = target.closest('.asterveil-home-eye');
    const heading = eye?.closest<HTMLElement>('[data-av-home-section]');
    const id = heading?.dataset.avHomeSection as HomeSectionId | undefined;
    if (id) toggleVisible(id);
  }

  function bindContainer() {
    if (!container || containerScope) return;
    containerScope = new AbortController();
    const options = { signal: containerScope.signal };
    container.addEventListener('click', handleClick, options);
    container.addEventListener('keydown', handleGripKey, options);
    container.addEventListener('dragstart', handleDragStart, options);
    container.addEventListener('dragover', handleDragOver, options);
    container.addEventListener('drop', handleDrop, options);
    container.addEventListener('dragend', handleDragEnd, options);
    // The browser keeps dispatching dragover on the document while the pointer
    // leaves the container, which is what edge scrolling needs.
    window.addEventListener(
      'dragover',
      (event) => {
        if (!dragging) return;
        dragX = event.clientX;
        dragY = event.clientY;
      },
      options,
    );
    window.addEventListener(
      'scroll',
      () => {
        if (dragging) updateDropAt(dragX, dragY);
      },
      { signal: containerScope.signal, passive: true },
    );
  }

  function ensureTools() {
    for (const block of blocks.values()) {
      const tool = block.heading.querySelector<HTMLElement>(':scope > .asterveil-home-tool');
      if (!editing) {
        tool?.remove();
        continue;
      }
      const item = current?.find((section) => section.id === block.id);
      const visible = item?.visible !== false;
      const title = titleOf(block.id);
      const label = `${visible ? '隐藏' : '显示'}${title}`;
      if (tool) {
        const eye = tool.querySelector<HTMLElement>('.asterveil-home-eye');
        if (eye) {
          eye.setAttribute('aria-pressed', String(visible));
          eye.setAttribute('aria-label', label);
          eye.title = label;
          eye.innerHTML = visible ? icons.eye : icons.eyeOff;
        }
        continue;
      }
      const next = document.createElement('span');
      next.className = 'asterveil-home-tool';
      const grip = document.createElement('span');
      grip.className = 'asterveil-home-grip';
      grip.setAttribute('role', 'button');
      grip.setAttribute('tabindex', '0');
      grip.setAttribute('aria-label', `拖动${title}排序`);
      grip.title = `拖动${title}排序，或用方向键调整`;
      grip.draggable = true;
      grip.innerHTML = icons.grip;
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'asterveil-home-eye';
      eye.setAttribute('aria-pressed', String(visible));
      eye.setAttribute('aria-label', label);
      eye.title = label;
      eye.innerHTML = visible ? icons.eye : icons.eyeOff;
      next.append(grip, eye);
      block.heading.append(next);
    }
  }

  function apply() {
    observer.disconnect();
    if (!current || !container?.isConnected || scope.signal.aborted) return;
    ensureBar();
    const headings = Array.from(
      container.querySelectorAll<HTMLElement>('.column > h4.ui.top.attached.header'),
    );
    const first = headings.find((heading) =>
      homeSections.some(({ title }) => heading.textContent?.trim() === title),
    );
    const nextGrid = first?.parentElement?.parentElement;
    if (!(nextGrid instanceof HTMLElement) || !nextGrid.matches('.ui.grid')) {
      restore();
      observer.observe(container, { childList: true, subtree: true });
      return;
    }
    if (grid && grid !== nextGrid) restore();
    grid = nextGrid;
    const main = grid.querySelector<HTMLElement>(':scope > .ten.wide.column');
    const side = grid.querySelector<HTMLElement>(':scope > .six.wide.column');
    if (!main || !side) {
      observer.observe(container, { childList: true, subtree: true });
      return;
    }
    columns = [main, side];
    main.dataset.avHomeColumn = 'main';
    side.dataset.avHomeColumn = 'side';
    for (const [id, block] of blocks) {
      if (block.heading.isConnected && !block.body.isConnected) {
        const replacement = block.heading.nextElementSibling;
        if (
          replacement instanceof HTMLElement &&
          replacement.matches('.ui.bottom.attached.segment')
        ) {
          block.body.removeAttribute('data-av-home-hidden');
          block.body = replacement;
        }
      }
      if (!block.heading.isConnected && block.body.isConnected) {
        const replacement = block.body.previousElementSibling;
        const title = titleOf(id);
        if (
          replacement instanceof HTMLElement &&
          replacement.matches('h4.ui.top.attached.header') &&
          replacement.textContent?.trim() === title
        ) {
          block.heading.removeAttribute('data-av-home-hidden');
          block.heading = replacement;
        }
      }
      if (block.heading.isConnected && block.body.isConnected) continue;
      for (const anchor of block.anchors) anchor.remove();
      block.heading.removeAttribute('data-av-home-hidden');
      block.body.removeAttribute('data-av-home-hidden');
      blocks.delete(id);
    }
    for (const heading of headings) {
      if (!columns.includes(heading.parentElement as HTMLElement)) continue;
      const section = homeSections.find(({ title }) => heading.textContent?.trim() === title);
      const body = heading.nextElementSibling;
      if (
        !section ||
        blocks.has(section.id) ||
        !(body instanceof HTMLElement) ||
        !body.matches('.ui.bottom.attached.segment')
      )
        continue;
      const anchors: [Comment, Comment] = [
        document.createComment('av-home-heading'),
        document.createComment('av-home-body'),
      ];
      heading.before(anchors[0]);
      body.before(anchors[1]);
      blocks.set(section.id, { id: section.id, heading, body, anchors });
    }
    if (style.parentNode !== document.documentElement) document.documentElement.append(style);
    grid.setAttribute('data-av-home-layout', '');
    grid.toggleAttribute('data-av-home-editing', editing);
    for (const [name, column] of [
      ['main', main],
      ['side', side],
    ] as const) {
      const ordered = current.filter((item) => item.column === name);
      const desired = ordered.flatMap((item) => {
        const block = blocks.get(item.id);
        if (!block) return [];
        for (const node of [block.heading, block.body]) {
          node.toggleAttribute('data-av-home-hidden', !item.visible);
          node.dataset.avHomeSection = item.id;
        }
        return [block.heading, block.body];
      });
      const existing = Array.from(column.children).filter((node) =>
        desired.includes(node as HTMLElement),
      );
      if (
        desired.length !== existing.length ||
        desired.some((node, index) => existing[index] !== node)
      )
        column.append(...desired);
    }
    ensureTools();
    for (const column of columns) {
      const hasContent = Array.from(column.children).some(
        (node) =>
          !node.matches('script, style, [hidden]') &&
          (editing || !node.hasAttribute('data-av-home-hidden')),
      );
      column.toggleAttribute('data-av-home-empty', !hasContent);
    }
    const visibleColumns = columns.filter(
      (column) => !column.hasAttribute('data-av-home-empty'),
    ).length;
    grid.toggleAttribute('data-av-home-single', visibleColumns === 1);
    const showEmpty = !editing && visibleColumns === 0;
    if (showEmpty && empty.nextElementSibling !== grid) grid.before(empty);
    else if (!showEmpty) empty.remove();
    observer.observe(container, { childList: true, subtree: true });
    bindContainer();
  }

  scope.defer(() => {
    observer.disconnect();
    detachContainer();
    removeBar();
    restore();
  });

  function update(url: URL, settings: Settings | undefined) {
    const active = url.pathname === '/' && Boolean(settings?.enabled);
    if (!active) {
      editing = false;
      current = undefined;
      lastKey = '';
      restore();
      removeBar();

      return;
    }
    const layout = settings?.homeLayout ?? defaultHomeLayout();
    const nextContainer = document.querySelector<HTMLElement>('.ui.main.container');
    if (nextContainer !== container) {
      restore();
      detachContainer();
      container = nextContainer;
      lastKey = '';
    }
    current = layout;
    ensureBar();
    const key = `${url.pathname}|${editing}|${JSON.stringify(layout)}`;
    if (key === lastKey && container?.isConnected) return;
    lastKey = key;
    if (editing || JSON.stringify(layout) !== JSON.stringify(defaultHomeLayout())) apply();
    else restore();
  }

  return { update };
}
