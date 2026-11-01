import type { Scope } from '../core/scope';
import { watchBackgroundPreview } from '../shared/background-preview';
import { watchColorMode } from '../shared/color-mode';
import { paletteVariables } from '../shared/palette';
import type { Settings } from '../shared/settings';
import { backgroundCss } from './background';
import effectsCss from './effects.css?inline';
import { resolveSite } from './target';
import css from './theme.css?inline';

// Pure CSS is installed at document_start; DOM enhancements wait until DOMContentLoaded.
export function createPageTheme(scope: Scope, initialUrl: URL) {
  const root = document.documentElement;
  const attributes = ['data-asterveil-appearance', 'data-asterveil-scheme'] as const;
  const previous = attributes.map((name) => root.getAttribute(name));
  const style = document.createElement('style');
  style.dataset.asterveil = 'ui-theme';
  style.textContent = `${css}\n${effectsCss}`;
  const palette = document.createElement('style');
  palette.dataset.asterveil = 'palette';
  const background = document.createElement('style');
  background.dataset.asterveil = 'background';
  const preview = document.createElement('style');
  preview.dataset.asterveil = 'background-preview';
  root.append(style, palette, background, preview);
  watchBackgroundPreview(scope, (value) => {
    preview.textContent =
      value === undefined
        ? ''
        : `@media screen { html[data-asterveil-appearance="polished"] { --av-background-strength: ${100 - value}%; } }`;
  });
  let lastBackground: Settings['background'] | undefined;
  let active = false;
  let lastColor = '';
  let current: Settings | undefined;
  const setMode = watchColorMode(scope, (scheme) => {
    if (!active || !current) return;
    const key = `${current.accentColor}:${scheme}`;
    if (lastColor !== key) {
      palette.textContent = `html[data-asterveil-appearance="polished"] { ${paletteVariables(current.accentColor, scheme)} }\n@media print { html[data-asterveil-appearance="polished"] { ${paletteVariables(current.accentColor)} } }`;
      lastColor = key;
    }
    root.setAttribute('data-asterveil-scheme', scheme);
  });
  const restore = () => {
    background.textContent = '';
    lastBackground = undefined;
    root.removeAttribute('data-asterveil-background');
    if (!active) return;
    attributes.forEach((name, index) => {
      const value = previous[index];
      if (value == null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    });
    active = false;
  };

  // Prevent a frame in the site's original palette while local preferences arrive.
  // Fail open if storage is unavailable; never leave a page hidden indefinitely.
  const guard = document.createElement('style');
  guard.dataset.asterveil = 'initial-paint';
  guard.textContent = 'html[data-asterveil-loading] { visibility: hidden !important; }';
  const previousLoading = root.getAttribute('data-asterveil-loading');
  let pending = Boolean(resolveSite(initialUrl));
  if (pending) {
    root.setAttribute('data-asterveil-loading', '');
    root.append(guard);
  }
  const reveal = () => {
    if (!pending) return;
    pending = false;
    guard.remove();
    if (previousLoading === null) root.removeAttribute('data-asterveil-loading');
    else root.setAttribute('data-asterveil-loading', previousLoading);
  };
  const fallback = window.setTimeout(reveal, 800);
  scope.defer(() => {
    clearTimeout(fallback);
    reveal();
    restore();
    style.remove();
    palette.remove();
    background.remove();
    preview.remove();
  });
  return {
    update(settings: Settings | undefined) {
      if (scope.signal.aborted) return;
      current = settings;
      if (settings?.enabled && settings.modules['ui-theme']) {
        root.setAttribute('data-asterveil-appearance', 'polished');
        active = true;
        setMode(settings.colorMode);
        if (
          lastBackground?.image !== settings.background.image ||
          lastBackground?.enabled !== settings.background.enabled ||
          lastBackground?.opacity !== settings.background.opacity
        ) {
          background.textContent = backgroundCss(settings.background);
          lastBackground = settings.background;
        }
        // The ambient gradient steps aside while a custom background is shown.
        root.toggleAttribute(
          'data-asterveil-background',
          settings.background.enabled && Boolean(settings.background.image),
        );
      } else restore();
      clearTimeout(fallback);
      reveal();
    },
  };
}
