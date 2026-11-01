// Keep the encoded image small enough to leave room for local drafts and settings.
export const maxBackgroundLength = 1_500_000;

export interface BackgroundSettings {
  readonly image: string | null;
  readonly enabled: boolean;
  /** How much of the image shows through the canvas, 0-100. */
  readonly opacity: number;
}

export function defaultBackground(): BackgroundSettings {
  return { image: null, enabled: false, opacity: 65 };
}

export function isBackgroundImage(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.length <= maxBackgroundLength &&
      /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
  );
}

export function isBackgroundOpacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function decodeBackground(value: unknown): BackgroundSettings {
  if (value === undefined) return defaultBackground();
  if (typeof value !== 'object' || value === null) throw new Error('背景设置数据无效。');
  const background = value as Record<string, unknown>;
  // Settings written before the mask became an opacity stored the canvas
  // strength instead; the two always summed to 100.
  const opacity =
    background.opacity ?? (isBackgroundOpacity(background.overlay) ? 100 - background.overlay : 0);
  if (
    !isBackgroundImage(background.image) ||
    typeof background.enabled !== 'boolean' ||
    !isBackgroundOpacity(opacity)
  ) {
    throw new Error('背景设置数据无效。');
  }
  return { image: background.image, enabled: background.enabled, opacity };
}
