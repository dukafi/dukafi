import React from 'react';
import type { IconProps } from '../types';

export function BulletlistSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M6 15h2v2H6v2H4v-2H2v-2h2v-2h2v2Zm12 4h-8v-2h8v2Zm4-4H10v-2h12v2ZM6 7h2v2H6v2H4V9H2V7h2V5h2v2Zm12 4h-8V9h8v2Zm4-4H10V5h12v2Z"/>
    </svg>
  );
}
