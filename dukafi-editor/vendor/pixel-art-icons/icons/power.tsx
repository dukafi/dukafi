import React from 'react';
import type { IconProps } from '../types';

export function PowerIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 22H6v-2h12v2ZM6 20H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 18H2V8h2v10Zm18 0h-2V8h2v10Zm-9-7h-2V2h2v9ZM6 8H4V6h2v2Zm14 0h-2V6h2v2ZM8 6H6V4h2v2Zm10 0h-2V4h2v2Z"/>
    </svg>
  );
}
