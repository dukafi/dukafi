import React from 'react';
import type { IconProps } from '../types';

export function Copy2SolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 8h2v12h-2v2h-8v-2H8V8h2V6h8v2ZM6 16H4V4h2v12Zm8-12H6V2h8v2Z"/>
    </svg>
  );
}
