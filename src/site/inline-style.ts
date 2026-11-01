import type { Scope } from '../core/scope';

/**
 * Mount a feature stylesheet for the lifetime of the scope.
 *
 * Feature CSS is injected by the module that creates the markup, so a page that
 * never runs the feature never loads its rules, and the site-wide theme sheet
 * stays free of extension-owned selectors.
 */
export function useInlineStyle(scope: Scope, marker: string, css: string): void {
  if (scope.signal.aborted) return;
  const style = document.createElement('style');
  style.dataset.asterveil = marker;
  style.textContent = css;
  document.documentElement.append(style);
  scope.defer(() => style.remove());
}
