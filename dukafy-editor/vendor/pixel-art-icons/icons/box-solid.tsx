import React from 'react';
import type { IconProps } from '../types';

export function BoxSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M14 4h4v2h4v12h-4v2h-4v-8h4v-2h2V8h-2v2h-4v2h-4v-2H6v2h4v2h2v6h2v2h-4v-2H6v-2H2V6h4V4h4V2h4v2ZM4 10h2V8H4v2Z"/>
    </svg>
  );
}
