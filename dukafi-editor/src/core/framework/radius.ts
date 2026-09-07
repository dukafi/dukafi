/**
 * Site radius defaults — buttons, inputs, images, articles, and divs.
 *
 * Quiet recipes omit `rounded-*` so this default paints cards and CTAs.
 * `rounded-full` stays on search chips. One slider writes `--radius`;
 * these :where() rules paint the tags. A class or Tailwind utility on the
 * selected element still wins.
 */

import type { FrameworkSpacingSettings } from '@core/framework-schema'

const RADIUS_ELEMENTS = `
:where(button, a, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]), select, textarea) {
  border-radius: var(--radius-button);
}

:where(img, video) {
  border-radius: var(--radius-image);
}

:where(article, div) {
  border-radius: var(--radius-card);
}
`.trim()

export function generateRadiusCss(
  settings: FrameworkSpacingSettings | null | undefined,
): string {
  if (!settings || settings.isDisabled) return ''
  return RADIUS_ELEMENTS
}
