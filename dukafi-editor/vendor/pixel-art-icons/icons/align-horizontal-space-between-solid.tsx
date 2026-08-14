import React from 'react';
import type { IconProps } from '../types';

export function AlignHorizontalSpaceBetweenSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <path d="M5 4h3v2h2v12H8v2H5v2H3V2h2v2Zm16 18h-2v-5h-3v-2h-2V9h2V7h3V2h2v20Z"/>
    </svg>
  );
}
