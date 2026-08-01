import React from 'react';
import type { IconProps } from '../types';

export function PowerOffIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 22H6v-2h10v2Zm6 0h-2v-2h2v2ZM6 20H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 18H2V8h2v10Zm14 0h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm6 0h-2V8h2v8Zm-8-2h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-2-2H8V8h2v2ZM8 8H6V6h2v2Zm5 0h-2V2h2v6Zm7 0h-2V6h2v2ZM6 6H4V4h2v2Zm12 0h-2V4h2v2ZM4 4H2V2h2v2Z"/>
    </svg>
  );
}
