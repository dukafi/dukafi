import React from 'react';
import type { IconProps } from '../types';

export function PenSquareSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 6H8v2H6v10h10v-2h2v-3h3v6h-2v2H5v-2H3V5h2V3h6v3Zm5-2V2h2v2h2v2h2v2h-2v2h-2v2h-2v2h-2v2H8v-6h2V8h2V6h2V4h2Zm-6 10h2v-2h-2v2Z"/>
    </svg>
  );
}
