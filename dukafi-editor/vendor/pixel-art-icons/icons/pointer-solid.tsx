import React from 'react';
import type { IconProps } from '../types';

export function PointerSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M9 11h2V9h2v2h2V9h2v3h2v-2h2v10h-2v3H7v-2H5v-2H3v-6h2v2h2V3h2v8Zm-2 6h2v-2H7v2Z"/>
    </svg>
  );
}
