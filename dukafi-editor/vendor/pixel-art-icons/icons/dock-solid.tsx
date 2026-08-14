import React from 'react';
import type { IconProps } from '../types';

export function DockSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 20H4v-2H2v-8h20v8h-2v2ZM6 16h12v-2H6v2ZM20 6h2v2H2V6h2V4h16v2Z"/>
    </svg>
  );
}
