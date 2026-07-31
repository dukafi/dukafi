import React from 'react';
import type { IconProps } from '../types';

export function EraserSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M15 6h2v2h2v2h2v2h-2v2h-4v-2h-2v2h2v4h6v2H7v-2H5v-2H3v-2h2v-2h2v-2h4v2h2v-2h-2V6h2V4h2v2Z"/>
    </svg>
  );
}
