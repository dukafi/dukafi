import React from 'react';
import type { IconProps } from '../types';

export function Image2SolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 22H4v-2H2V4h2V2h16v2h2v16h-2v-6h-2v-2h-2v-2h-2v2h-2v2h-2v2H8v2H6v2h14v2ZM8 8H6v2h2v2h2v-2h2V8h-2V6H8v2Z"/>
    </svg>
  );
}
