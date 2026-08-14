import React from 'react';
import type { IconProps } from '../types';

export function CornerDownLeftIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M10 20H8v-2H6v-2H4v-2h2v-2h2v-2h2v4h8v2h-8v4Zm10-6h-2V4h2v10Z"/>
    </svg>
  );
}
