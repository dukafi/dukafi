import type { SVGProps } from 'react'

/**
 * The Dukafi mark — a shopping bag whose silhouette is also a lowercase "u",
 * the letter it replaces in the "dukafi" lockup.
 *
 * Inline rather than an <img> because the mark is a UI element, not content:
 * it has to take the surrounding text colour (`currentColor`) so it reads on
 * the light and dark admin palettes alike, and on whatever background the
 * caller puts behind it. An <img> would be locked to the terracotta it was
 * exported in.
 *
 * Geometry is the vector source verbatim (three stroked paths on a 240x240
 * canvas). The viewBox crops to the mark's own bounds plus even padding so a
 * 16px render fills its box instead of floating in whitespace — the stroke
 * widths are authored for 240 units, so cropping is the only way to keep the
 * weight right at small sizes.
 */
interface DukafiMarkProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox'> {
  /** Rendered edge length in px. Square, so one number covers both axes. */
  size?: number
}

export function DukafiMark({ size = 16, ...props }: DukafiMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="26 34 186 186"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M46 72 L96 72 L100 92 Q103 104 112 104 L128 104 Q137 104 140 92 L144 72 L194 72"
        strokeWidth="15"
      />
      <path d="M98 112 A22 22 0 0 0 142 112" strokeWidth="9" />
      <path
        d="M58 84 L76 166 Q82 182 100 182 L140 182 Q158 182 164 166 L182 84"
        strokeWidth="19"
      />
    </svg>
  )
}
