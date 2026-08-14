import React from 'react';
import type { IconProps } from '../types';

export function Copy2SharpIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 6h4v16H8v-4H4V2h12v4Zm-6 14h8V8h-8v12Zm-2-4V6h6V4H6v12h2Z"/>
    </svg>
  );
}
