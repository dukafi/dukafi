import React from 'react';
import type { IconProps } from '../types';

export function SquareSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 22H4v-2H2V4h2V2h16v2h2v16h-2v2Z"/>
    </svg>
  );
}
