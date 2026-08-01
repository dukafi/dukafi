import React from 'react';
import type { IconProps } from '../types';

export function CopySolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 8h2v12h-2v2H8v-2H6V8h2V6h12v2ZM4 16H2V4h2v12ZM16 4H4V2h12v2Z"/>
    </svg>
  );
}
