import React from 'react';
import type { IconProps } from '../types';

export function SearchSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2H4v-2H2V6h2v4h2V6h4V4H6V2h8v2h2v2h2v8h-2v2h-2v2Zm4 0h-2v-2h2v2ZM6 6H4V4h2v2Z"/>
    </svg>
  );
}
