import React from 'react';
import type { IconProps } from '../types';

export function SaveSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 4h2v2h2v14h-2v2H4v-2H2V4h2V2h14v2ZM6 14v6h2v-6H6Zm10 0v6h2v-6h-2Zm-8-2v2h8v-2H8ZM6 6v4h6V6H6Z"/>
    </svg>
  );
}
