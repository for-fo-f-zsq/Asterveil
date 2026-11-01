import type { Scope } from '../core/scope';
import css from './click-ripple.css?inline';

const rippleLifetime = 450;
const rippleSpeed = 0.17;
const rippleBand = 9;
const maxRipples = 8;
const ringLayers: ReadonlyArray<readonly [width: number, alpha: number]> = [
  [rippleBand * 1.9, 0.025],
  [rippleBand * 1.35, 0.05],
  [rippleBand, 0.09],
];

interface Ripple {
  x: number;
  y: number;
  born: number;
  color: string;
}

// Clicking drops expanding rings onto a fixed canvas. Mirrored ring sources
// across the four viewport edges stand in for reflected waves, so the rings
// appear to bounce off the screen border like water.
export function mountClickRipple(scope: Scope): { update(enabled: boolean): void } {
  const controller = new AbortController();
  const style = document.createElement('style');
  style.dataset.asterveil = 'click-ripple';
  style.textContent = css;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ripples: Ripple[] = [];
  let canvas: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | undefined;
  let frame = 0;
  let enabled = false;
  let width = 0;
  let height = 0;
  let dpr = 1;

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    ripples.length = 0;
    canvas?.remove();
    canvas = undefined;
    context = undefined;
  }

  function resize() {
    if (!canvas || !context) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureCanvas() {
    if (canvas) return;
    if (style.parentNode !== document.documentElement) document.documentElement.append(style);
    const node = document.createElement('canvas');
    node.className = 'asterveil-click-ripple';
    node.setAttribute('aria-hidden', 'true');
    const ctx = node.getContext('2d');
    if (!ctx) return;
    canvas = node;
    context = ctx;
    document.body.append(node);
    resize();
  }

  function accentColor() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--av-accent').trim();
    return value || '#8b5cf6';
  }

  function draw(now: number) {
    frame = 0;
    if (!context) return;
    context.clearRect(0, 0, width, height);
    for (let index = ripples.length - 1; index >= 0; index--) {
      const ripple = ripples[index];
      if (ripple && now - ripple.born >= rippleLifetime) ripples.splice(index, 1);
    }
    if (!ripples.length) return;
    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    for (const ripple of ripples) {
      const age = now - ripple.born;
      const fade = Math.min(1, age / 90) * Math.max(0, 1 - age / rippleLifetime) ** 1.4;
      if (fade <= 0) continue;
      const radius = age * rippleSpeed;
      const sources: ReadonlyArray<readonly [number, number]> = [
        [ripple.x, ripple.y],
        [-ripple.x, ripple.y],
        [width * 2 - ripple.x, ripple.y],
        [ripple.x, -ripple.y],
        [ripple.x, height * 2 - ripple.y],
        [-ripple.x, -ripple.y],
        [width * 2 - ripple.x, -ripple.y],
        [-ripple.x, height * 2 - ripple.y],
        [width * 2 - ripple.x, height * 2 - ripple.y],
      ];
      context.strokeStyle = ripple.color;
      for (const [x, y] of sources) {
        for (const [lineWidth, alpha] of ringLayers) {
          context.globalAlpha = fade * alpha;
          context.lineWidth = lineWidth;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.stroke();
        }
      }
    }
    context.globalAlpha = 1;
    context.restore();
    frame = requestAnimationFrame(draw);
  }

  function onPointerDown(event: PointerEvent) {
    if (!enabled || event.button !== 0) return;
    ensureCanvas();
    if (!context) return;
    ripples.push({
      x: event.clientX,
      y: event.clientY,
      born: performance.now(),
      color: accentColor(),
    });
    if (ripples.length > maxRipples) ripples.splice(0, ripples.length - maxRipples);
    if (!frame) frame = requestAnimationFrame(draw);
  }

  document.addEventListener('pointerdown', onPointerDown, {
    capture: true,
    passive: true,
    signal: controller.signal,
  });
  window.addEventListener('resize', resize, { signal: controller.signal });
  scope.defer(() => {
    controller.abort();
    stop();
    style.remove();
  });

  return {
    update(value: boolean) {
      if (reducedMotion.matches || value === enabled) return;
      enabled = value;
      if (enabled) ensureCanvas();
      else stop();
    },
  };
}
