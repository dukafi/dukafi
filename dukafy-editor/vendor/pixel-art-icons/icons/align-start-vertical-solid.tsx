import React from 'react';
import type { IconProps } from '../types';

export function AlignStartVerticalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M4 22H2V2h2v20Zm9-7h2v4h-2v2H8v-2H6v-4h2v-2h5v2Zm7-10h2v4h-2v2H8V9H6V5h2V3h12v2Z"/>
    </svg>
  );
}
