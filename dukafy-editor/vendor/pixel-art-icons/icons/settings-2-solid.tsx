import React from 'react';
import type { IconProps } from '../types';

export function Settings2SolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M10 14h2v2h10v2H12v2h-2v2H6v-2H4v-2H2v-2h2v-2h2v-2h4v2Zm8-10h2v2h2v2h-2v2h-2v2h-4v-2h-2V8H2V6h10V4h2V2h4v2Z"/>
    </svg>
  );
}
