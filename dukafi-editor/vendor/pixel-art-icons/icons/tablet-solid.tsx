import React from 'react';
import type { IconProps } from '../types';

export function TabletSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M19 22H5v-2H3V4h2V2h14v2h2v16h-2v2Zm-8-4h2v-2h-2v2Z"/>
    </svg>
  );
}
