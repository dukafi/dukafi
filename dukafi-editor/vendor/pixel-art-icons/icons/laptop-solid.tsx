import React from 'react';
import type { IconProps } from '../types';

export function LaptopSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M23 16v4H1v-4h22ZM19 6h2v8H3V6h2V4h14v2Z"/>
    </svg>
  );
}
