import React from 'react';
import type { IconProps } from '../types';

export function ColorsSwatchSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 4h2v16h-2v2h-6v-2h-2v2H4v-2H2v-4h2v-2h6v6h2V4h2V2h6v2Zm-4 14h2v-2h-2v2ZM6 8V6h4v6H4V8h2Z"/>
    </svg>
  );
}
