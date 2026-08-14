import React from 'react';
import type { IconProps } from '../types';

export function ImagesSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M3 18h2v2h12v2H3v-2H1V8h2v10ZM21 4h2v12h-2v2H7v-2H5V4h2V2h14v2Zm-4 8h-2v2h-2v2h8v-4h-2v-2h-2v2Zm-6-4H9v2h2v2h2v-2h2V8h-2V6h-2v2Z"/>
    </svg>
  );
}
