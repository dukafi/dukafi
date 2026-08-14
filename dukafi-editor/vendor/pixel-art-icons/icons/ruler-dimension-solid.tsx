import React from 'react';
import type { IconProps } from '../types';

export function RulerDimensionSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M19 13h2v6h-2v2H5v-2H3v-6h2v-2h14v2ZM7 16h2v-3H7v3Zm4 0h2v-3h-2v3Zm4 0h2v-3h-2v3ZM5 5h14V3h2v6h-2V7H5v2H3V3h2v2Z"/>
    </svg>
  );
}
