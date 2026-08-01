import React from 'react';
import type { IconProps } from '../types';

export function EyeSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 18H4v-2H2v-2H0v-4h2V8h2V6h4V4h8v2h4v2h2v2h2v4h-2v2h-2v2h-4v2H8v-2Zm2-8H8v4h2v2h4v-2h2v-4h-2V8h-4v2Zm4 2h-2v-2h2v2Z"/>
    </svg>
  );
}
