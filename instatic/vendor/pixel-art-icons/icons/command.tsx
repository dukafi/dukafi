import React from 'react';
import type { IconProps } from '../types';

export function CommandIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 22H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 20H2v-4h2v4Zm6-12h4V4h2v4h4v2h-4v4h4v2h-4v4h-2v-4h-4v4H8v-4H4v-2h4v-4H4V8h4V4h2v4Zm12 12h-2v-4h2v4Zm-12-6h4v-4h-4v4ZM4 8H2V4h2v4Zm18 0h-2V4h2v4ZM8 4H4V2h4v2Zm12 0h-4V2h4v2Z"/>
    </svg>
  );
}
