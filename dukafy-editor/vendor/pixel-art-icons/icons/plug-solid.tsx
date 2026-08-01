import React from 'react';
import type { IconProps } from '../types';

export function PlugSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M10 7h4V2h2v5h5v2h-1v5h-2v2h-2v2h-3v4h-2v-4H8v-2H6v-2H4V9H3V7h5V2h2v5Z"/>
    </svg>
  );
}
