import React from 'react';
import type { IconProps } from '../types';

export function AlignEndHorizontalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M22 22H2v-2h20v2ZM9 4h2v12H9v2H5v-2H3V4h2V2h4v2Zm10 7h2v5h-2v2h-4v-2h-2v-5h2V9h4v2Z"/>
    </svg>
  );
}
