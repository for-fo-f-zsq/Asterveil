import type { BackgroundSettings } from '../shared/background';

export function backgroundCss(background: BackgroundSettings): string {
  if (!background.enabled || !background.image) return '';
  // The image is a validated, bounded raster data URL; it cannot inject CSS or fetch a URL.
  return `@media screen {
    html[data-asterveil-appearance="polished"] {
      --av-background-veil: color-mix(in srgb, var(--av-canvas) var(--av-background-strength, ${100 - background.opacity}%), transparent);
      background: linear-gradient(var(--av-background-veil), var(--av-background-veil)), url("${background.image}") center / cover no-repeat fixed;
      background-color: var(--av-canvas);
    }
    html[data-asterveil-appearance="polished"] body,
    html[data-asterveil-appearance="polished"] body > .pusher {
      /* Semantic UI's body.pushable uses an important gray background. */
      background: transparent !important;
    }
    /* Loose text outside the content cards sits on the image itself, so it takes
       the theme ink instead of a fixed chip that would hide the picture. */
    html[data-asterveil-appearance="polished"] .ui.center.aligned.container > span:has(> a[href*="beian.miit.gov.cn"]) {
      color: var(--av-text);
    }
    html[data-asterveil-appearance="polished"] .ui.center.aligned.container > span > a {
      color: color-mix(in srgb, var(--av-accent) 80%, var(--av-text));
    }
    html[data-asterveil-appearance="polished"] #show_tag {
      color: var(--av-text);
    }
    html[data-asterveil-appearance="polished"] #show_tag > label {
      color: var(--av-text) !important;
    }
  }`;
}
