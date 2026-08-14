import React from 'react';
import type { IconProps } from '../types';

export function UnderlineIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M19 20H5v-2h14v2Zm-3-4H8v-2h8v2Zm-8-2H6V4h2v10Zm10 0h-2V4h2v10Z"/>
    </svg>
  );
}
