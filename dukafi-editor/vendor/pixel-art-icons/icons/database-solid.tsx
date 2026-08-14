import React from 'react';
import type { IconProps } from '../types';

export function DatabaseSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 20v2H8v-2h8Zm-8 0H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 18H2v-2h2v2Zm12 0H8v-2h8v2Zm6 0h-2v-2h2v2ZM8 16H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 14H2v-2h2v2ZM16 4h4v2h2v4h-2v2h-4v2H8v-2H4v-2H2V6h2V4h4V2h8v2Zm6 10h-2v-2h2v2Z"/>
    </svg>
  );
}
