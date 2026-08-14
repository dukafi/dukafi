import React from 'react';
import type { IconProps } from '../types';

export function ProportionsSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 6h2v12h-2v2H4v-2h7v-8H4v8H2V6h2V4h16v2Zm-4 6h-3v6h3v-6Z"/>
    </svg>
  );
}
