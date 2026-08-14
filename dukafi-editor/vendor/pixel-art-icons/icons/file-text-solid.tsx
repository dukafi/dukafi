import React from 'react';
import type { IconProps } from '../types';

export function FileTextSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 4h-2v4h4V6h2v14h-2v2H6v-2H4V4h2V2h10v2ZM8 18h8v-2H8v2Zm0-4h8v-2H8v2Zm0-4h2V8H8v2Zm10-4h-2V4h2v2Z"/>
    </svg>
  );
}
